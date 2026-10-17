import * as v from "valibot";
import type { SeriesDef } from "~/domain/types";
import { classify, permanent, transient } from "../errors";
import {
  type GpuCohort,
  type ListPrice,
  perGpuHour,
  perGpuSeriesDef,
  toObservations,
  utcDate,
} from "../gpu-list-price";
import type { CollectOutput, Collector } from "../types";

// AWS Price List Bulk API offer files: public, documented for programmatic download.
// https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api-fetching-price-list-files-manually.html
// The EC2 file for one region is ~300 MB of CSV, so it is streamed and only the
// rows for the tracked instance types are kept.
const BASE = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2";
const REGION = "us-east-1";
export const VERSIONS_URL = `${BASE}/index.json`;
export const versionCsvUrl = (version: string) => `${BASE}/${version}/${REGION}/index.csv`;
const CURRENT_URL = versionCsvUrl("current");

// Large files: allow minutes, not the default 40 s.
const DOWNLOAD_TIMEOUT_MS = 600_000;
// Backfill only recent history: enough for year-over-year comparisons and the
// June 2025 price cut, without downloading every monthly file since 2020.
const BACKFILL_MONTHS = 24;

type AwsInstance = { instanceType: string; cohort: GpuCohort; gpus: number };

// GPU counts come from the EC2 instance type docs (and match the file's "GPU" column).
// p5e.48xlarge (H200) is not sold in us-east-1, so p5en stands in for H200.
export const AWS_INSTANCES: AwsInstance[] = [
  { instanceType: "p5.48xlarge", cohort: "h100", gpus: 8 },
  // p5e (H200) is not sold in us-east-1; p5en is the H200 instance there.
  { instanceType: "p5en.48xlarge", cohort: "h200", gpus: 8 },
];

// Minimal CSV field splitter: AWS quotes every field and escapes quotes as "".
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

export type PriceListExtract = {
  publicationDate: string;
  version: string;
  // The 5 metadata lines plus the column header, kept for the snapshot.
  preamble: string[];
  rows: { raw: string; fields: Record<string, string> }[];
};

// Reads the offer file line by line and keeps only lines naming a tracked
// instance type. The cheap substring check avoids CSV-parsing ~1M rows.
export async function extractPriceList(
  lines: AsyncIterable<string>,
  instanceTypes: string[],
): Promise<PriceListExtract> {
  const needles = instanceTypes.map((t) => `"${t}"`);
  const preamble: string[] = [];
  const meta: Record<string, string> = {};
  let header: string[] | undefined;
  const rows: PriceListExtract["rows"] = [];
  for await (const line of lines) {
    if (!header) {
      if (line.trim() === "") continue;
      preamble.push(line);
      const cells = parseCsvLine(line);
      if (cells[0] === "SKU") {
        header = cells;
      } else if (cells.length === 2 && cells[0]) {
        meta[cells[0]] = cells[1] ?? "";
      }
      if (preamble.length > 10 && !header) throw permanent("AWS price list header not found");
      continue;
    }
    if (!needles.some((n) => line.includes(n))) continue;
    const cells = parseCsvLine(line);
    const fields: Record<string, string> = {};
    header.forEach((h, i) => {
      fields[h] = cells[i] ?? "";
    });
    rows.push({ raw: line, fields });
  }
  if (!header) throw permanent("AWS price list header not found");
  for (const col of ["Instance Type", "TermType", "PricePerUnit", "Operating System"]) {
    if (!header.includes(col)) throw permanent(`AWS price list lacks column ${col}`);
  }
  const publicationDate = meta["Publication Date"];
  const version = meta.Version;
  if (!publicationDate || !version) throw permanent("AWS price list lacks publication metadata");
  return { publicationDate, version, preamble, rows };
}

// Plain on-demand Linux capacity: shared tenancy, no pre-installed software,
// a running instance ("Used"), not a capacity block or capacity reservation.
export function isPlainLinux(f: Record<string, string>) {
  return (
    f["Operating System"] === "Linux" &&
    f.Tenancy === "Shared" &&
    f.CapacityStatus === "Used" &&
    f["Pre Installed S/W"] === "NA" &&
    f["Product Family"] === "Compute Instance" &&
    f.operation === "RunInstances" &&
    // Older files predate the MarketOption column (capacity blocks).
    (f.MarketOption === undefined || f.MarketOption === "OnDemand") &&
    f.Currency === "USD" &&
    f.Unit === "Hrs"
  );
}

function single(rows: Record<string, string>[], what: string) {
  const prices = new Set(rows.map((r) => r.PricePerUnit));
  if (prices.size > 1) throw permanent(`ambiguous AWS ${what}: ${[...prices].join(", ")}`);
  const raw = rows[0]?.PricePerUnit;
  if (raw === undefined) return undefined;
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) throw permanent(`bad AWS price for ${what}: ${raw}`);
  return price;
}

// On-demand rate only. AWS publishes spot and savings plans elsewhere.
export function extractAwsPrices(rows: Record<string, string>[], inst: AwsInstance): ListPrice[] {
  const linux = rows.filter((r) => r["Instance Type"] === inst.instanceType && isPlainLinux(r));
  const base = {
    provider: "aws" as const,
    cohort: inst.cohort,
    region: REGION,
    sku: inst.instanceType,
    gpus: inst.gpus,
  };
  const out: ListPrice[] = [];
  const onDemand = single(
    linux.filter((r) => r.TermType === "OnDemand"),
    `${inst.instanceType} on-demand`,
  );
  if (onDemand !== undefined) {
    out.push({
      ...base,
      priceType: "ondemand",
      instancePerHour: onDemand,
      perGpuHour: perGpuHour(onDemand, inst.gpus),
      derivation: `Instance list price ${onDemand} USD/hr / ${inst.gpus} GPUs`,
    });
  }
  return out;
}

const VersionIndexSchema = v.object({
  versions: v.record(
    v.string(),
    v.object({
      versionEffectiveBeginDate: v.pipe(v.string(), v.isoTimestamp()),
      versionEffectiveEndDate: v.optional(v.string()),
    }),
  ),
});

export type BackfillVersion = { version: string; start: string; end: string };

// Monthly historical price lists. Each version is labelled with the month it
// covers; the current (open-ended) version is handled by the daily path.
export function backfillVersions(json: unknown, from: string): BackfillVersion[] {
  const r = v.safeParse(VersionIndexSchema, json);
  if (!r.success) throw permanent("unexpected AWS version index payload");
  const byEnd = new Map<string, BackfillVersion>();
  for (const [version, info] of Object.entries(r.output.versions)) {
    const start = info.versionEffectiveBeginDate.slice(0, 10);
    if (!info.versionEffectiveEndDate || start < from) continue;
    // The end date is exclusive (the first day of the next month).
    const endExclusive = new Date(info.versionEffectiveEndDate);
    if (Number.isNaN(endExclusive.getTime())) continue;
    const end = utcDate(new Date(endExclusive.getTime() - 86_400_000));
    if (end < start) continue;
    // Several versions for one period: keep the latest publication.
    const prev = byEnd.get(end);
    if (!prev || prev.version < version) byEnd.set(end, { version, start, end });
  }
  return [...byEnd.values()].sort((a, b) => a.start.localeCompare(b.start));
}

async function* responseLines(res: Response): AsyncGenerator<string> {
  if (!res.body) {
    yield* (await res.text()).split(/\r?\n/);
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? "";
      yield* parts;
    }
  } catch (err) {
    throw transient("AWS price list download interrupted", err);
  }
  if (buffer) yield buffer;
}

const SERIES_CTX = {
  collector: "aws",
  source: "AWS Price List",
  sourceUrl: CURRENT_URL,
  filters:
    "Linux, shared tenancy, no pre-installed software, excluding capacity blocks and capacity reservations, from the us-east-1 AWS Price List bulk offer file (USD). On-demand only: spot prices and savings plans are not in this file",
};

function snapshotOf(extract: PriceListExtract) {
  // Only the rows the prices were taken from, not the whole 300 MB file.
  const kept = extract.rows.filter((r) => isPlainLinux(r.fields)).map((r) => r.raw);
  return { contentType: "text/csv", body: [...extract.preamble, ...kept].join("\n") };
}

export const awsCollector: Collector = {
  name: "aws",
  description: "AWS EC2 on-demand list prices for H100 and H200 instances, per GPU-hour",
  async collect({ backfill, now, fetch, log }) {
    const today = utcDate(now);
    const types = AWS_INSTANCES.map((i) => i.instanceType);
    const out: Required<Pick<CollectOutput, "series" | "observations" | "failures" | "snapshots">> =
      { series: [], observations: [], failures: [], snapshots: [] };
    const seen = new Set<string>();
    const addSeries = (s: SeriesDef) => {
      if (seen.has(s.id)) return;
      seen.add(s.id);
      out.series.push(s);
    };
    const record = (prices: ListPrice[]) => {
      for (const p of prices) {
        addSeries(perGpuSeriesDef(p, SERIES_CTX));
      }
    };

    // Daily: the current price list, dated today.
    const res = await fetch(CURRENT_URL, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
    const current = await extractPriceList(responseLines(res), types);
    out.snapshots.push(snapshotOf(current));
    const asOf = current.publicationDate.slice(0, 10);
    for (const inst of AWS_INSTANCES) {
      try {
        const prices = extractAwsPrices(
          current.rows.map((r) => r.fields),
          inst,
        );
        if (!prices.some((p) => p.priceType === "ondemand")) {
          throw permanent(`no Linux on-demand price for ${inst.instanceType} in ${REGION}`);
        }
        record(prices);
        out.observations.push(
          ...toObservations(prices, {
            start: today,
            end: today,
            asOf,
            note: `AWS price list version ${current.version}.`,
          }),
        );
        log(
          `${inst.instanceType}: ${prices.map((p) => `${p.priceType}=${p.perGpuHour.toFixed(3)}`).join(" ")}`,
        );
      } catch (err) {
        out.failures.push({ key: inst.instanceType, error: classify(err) });
      }
    }

    // Backfill: one observation per monthly historical price list. Instance
    // types that did not exist yet are simply absent from older files.
    if (backfill) {
      const index = await fetch(VERSIONS_URL);
      const from = new Date(now.getTime() - BACKFILL_MONTHS * 30.5 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const versions = backfillVersions(JSON.parse(await index.text()), from);
      log(`backfill: ${versions.length} monthly price lists since ${from}`);
      for (const ver of versions) {
        const url = versionCsvUrl(ver.version);
        try {
          const vres = await fetch(url, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
          const extract = await extractPriceList(responseLines(vres), types);
          out.snapshots.push(snapshotOf(extract));
          const prices = AWS_INSTANCES.flatMap((inst) =>
            extractAwsPrices(
              extract.rows.map((r) => r.fields),
              inst,
            ),
          );
          record(prices);
          out.observations.push(
            ...toObservations(prices, {
              start: ver.start,
              end: ver.end,
              asOf: extract.publicationDate.slice(0, 10),
              sourceUrl: url,
              note: `AWS monthly price list version ${ver.version} (effective ${ver.start} to ${ver.end}, published ${extract.publicationDate.slice(0, 10)}); mid-month price changes are not visible.`,
            }),
          );
          log(`backfill ${ver.version}: ${prices.length} prices`);
        } catch (err) {
          out.failures.push({ key: `version:${ver.version}`, error: classify(err) });
        }
      }
    }

    if (out.observations.length === 0) {
      throw out.failures[0]?.error ?? permanent("no AWS prices collected");
    }
    return out;
  },
};

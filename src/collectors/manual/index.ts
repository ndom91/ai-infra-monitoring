import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as v from "valibot";
import { parse } from "yaml";
import { CADENCES, INDICATOR_IDS, type ObservationInput, type SeriesDef } from "~/domain/types";
import { permanent } from "../errors";
import type { CollectOutput, Collector } from "../types";

// Hand-curated observations from reports and filings that have no API.
// Format and rules: data/manual/README.md.

export const DEFAULT_MANUAL_DIR = resolve(process.cwd(), "data/manual");

const IsoDate = v.pipe(v.string(), v.isoDate());
const Url = v.pipe(v.string(), v.url());
const NonEmpty = v.pipe(v.string(), v.trim(), v.minLength(1));

export const ManualObservationSchema = v.pipe(
  v.strictObject({
    period_start: IsoDate,
    period_end: IsoDate,
    value: v.pipe(v.number(), v.finite()),
    // "reported" is reserved for machine-collected source values.
    kind: v.optional(v.picklist(["manual", "estimated", "calculated"]), "manual"),
    as_of: v.optional(IsoDate),
    source_url: Url,
    // Verbatim text from source_url that states the number (or its inputs).
    quote: v.pipe(v.string(), v.trim(), v.minLength(10)),
    note: v.optional(NonEmpty),
  }),
  v.check((o) => o.period_start <= o.period_end, "period_start must not be after period_end"),
  v.check(
    (o) => o.kind === "manual" || o.note !== undefined,
    "calculated/estimated observations need a note explaining the derivation",
  ),
);

export const ManualSeriesSchema = v.strictObject({
  id: v.pipe(v.string(), v.regex(/^[A-Za-z0-9_.:-]+$/)),
  indicator: v.picklist(INDICATOR_IDS),
  label: NonEmpty,
  entity: v.optional(NonEmpty),
  source: NonEmpty,
  source_url: Url,
  unit: NonEmpty,
  currency: v.optional(v.nullable(NonEmpty)),
  cadence: v.picklist(CADENCES),
  methodology: NonEmpty,
  observations: v.pipe(v.array(ManualObservationSchema), v.minLength(1)),
});

export const ManualFileSchema = v.strictObject({
  series: v.pipe(v.array(ManualSeriesSchema), v.minLength(1)),
});
export type ManualFile = v.InferOutput<typeof ManualFileSchema>;

// Throws a permanent error naming the file and the failing path.
export function parseManualFile(name: string, text: string): ManualFile {
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (err) {
    throw permanent(`${name}: invalid YAML: ${(err as Error).message}`, err);
  }
  const r = v.safeParse(ManualFileSchema, raw);
  if (!r.success) {
    const detail = r.issues.map((i) => `${v.getDotPath(i) ?? "(root)"}: ${i.message}`).join("; ");
    throw permanent(`${name}: ${detail}`);
  }
  return r.output;
}

export function toCollectOutput(
  files: { name: string; data: ManualFile }[],
  now: Date,
): Required<Pick<CollectOutput, "series" | "observations">> {
  const today = now.toISOString().slice(0, 10);
  const out: Required<Pick<CollectOutput, "series" | "observations">> = {
    series: [],
    observations: [],
  };
  const seenSeries = new Map<string, string>();
  for (const { name, data } of files) {
    for (const s of data.series) {
      const other = seenSeries.get(s.id);
      if (other) {
        throw permanent(`${name}: series ${s.id} already defined in ${other}`);
      }
      seenSeries.set(s.id, name);
      const def: SeriesDef = {
        id: s.id,
        indicator: s.indicator,
        label: s.label,
        source: s.source,
        sourceUrl: s.source_url,
        unit: s.unit,
        methodology: s.methodology,
        cadence: s.cadence,
        collector: "manual",
      };
      if (s.entity) def.entity = s.entity;
      if (s.currency) def.currency = s.currency;
      out.series.push(def);

      const seenPeriods = new Set<string>();
      for (const o of s.observations) {
        if (seenPeriods.has(o.period_end)) {
          throw permanent(`${name}: ${s.id} has two observations ending ${o.period_end}`);
        }
        seenPeriods.add(o.period_end);
        if (o.as_of && o.as_of > today) {
          throw permanent(`${name}: ${s.id}@${o.period_end} as_of ${o.as_of} is in the future`);
        }
        const obs: ObservationInput = {
          seriesId: s.id,
          periodStart: o.period_start,
          periodEnd: o.period_end,
          value: o.value,
          kind: o.kind,
          sourceUrl: o.source_url,
          quote: o.quote.replace(/\s+/g, " "),
        };
        if (o.note) obs.note = o.note.replace(/\s+/g, " ");
        if (o.as_of) obs.asOf = o.as_of;
        out.observations.push(obs);
      }
    }
  }
  return out;
}

export function createManualCollector(dir: string): Collector {
  return {
    name: "manual",
    description: `Hand-curated report and filing figures from ${dir}/*.yaml`,
    async collect({ now, log }) {
      let names: string[];
      try {
        names = (await readdir(dir))
          .filter((n) => n.endsWith(".yaml") || n.endsWith(".yml"))
          .sort();
      } catch (err) {
        throw permanent(`cannot read ${dir}: ${(err as Error).message}`, err);
      }
      if (names.length === 0) throw permanent(`no YAML files in ${dir}`);

      const files: { name: string; data: ManualFile }[] = [];
      const snapshots: CollectOutput["snapshots"] = [];
      for (const name of names) {
        const text = await readFile(join(dir, name), "utf8");
        files.push({ name, data: parseManualFile(name, text) });
        // Keeps the exact curated text that produced each run.
        snapshots.push({
          contentType: "application/yaml",
          body: `# ${name}\n${text}`,
        });
      }
      const out = toCollectOutput(files, now);
      log(
        `${names.length} files, ${out.series.length} series, ${out.observations.length} observations`,
      );
      return { ...out, snapshots };
    },
  };
}

export const manualCollector = createManualCollector(DEFAULT_MANUAL_DIR);

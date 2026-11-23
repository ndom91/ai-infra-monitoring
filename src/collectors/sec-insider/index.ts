import { SEC_FILING_COMPANIES, type SecCompany } from "~/domain/companies";
import type { ObservationInput, SeriesDef } from "~/domain/types";
import { classify, permanent } from "../errors";
import { filingUrl, parseSubmissions, submissionsUrl } from "../sec-filings";
import type { CollectContext, CollectOutput, Collector } from "../types";

// Open-market insider sales from SEC Form 4 filings.
//
// Source terms: SEC EDGAR is public-domain data with a declared User-Agent
// and a limit of 10 requests per second (https://www.sec.gov/developer). This
// collector keeps a 150 ms gap, like the other SEC collectors.

const ROUTINE_WINDOW_DAYS = 120;
const REQUEST_GAP_MS = 150;
const FORMS = new Set(["4", "4/A"]);

export type Sale = {
  transactionDate: string;
  shares: number;
  price: number;
  // Identifies a sale across an original filing and its amendments.
  key: string;
};

export type ParsedForm4 = {
  // Document-level `aff10b5One` flag. Undefined for filings that predate the
  // element (schema X0508, 2023), where "not flagged" and "unknown" are the
  // same thing and must not be read as "not a 10b5-1 sale".
  tenB5One: boolean | undefined;
  sales: Sale[];
  // Code S disposals dropped because they report no price. Never imputed.
  skippedNoPrice: number;
};

export type Form4Filing = {
  accession: string;
  form: string;
  filedAt: string;
  parsed: ParsedForm4;
};

export type MonthlySales = {
  month: string; // YYYY-MM, from transactionDate
  totalUsd: number;
  tenB5OneUsd: number;
  // False when a contributing filing lacks the 10b5-1 flag.
  tenB5OneKnown: boolean;
  filings: number;
  transactions: number;
  asOf: string;
};

// The submissions list renders Form 4 through an XSL stylesheet, e.g.
// "xslF345X06/wk-form4_123.xml". The raw XML sits one directory up under the
// same file name (verified against a live NVDA filing).
export function rawXmlName(primaryDocument: string | undefined) {
  if (!primaryDocument) return undefined;
  const name = primaryDocument.replace(/^xsl[^/]*\//i, "");
  return name.toLowerCase().endsWith(".xml") && !name.includes("/") ? name : undefined;
}

// Form 4 XML is machine generated and flat enough that a tag scan is reliable;
// it avoids an XML dependency in the server bundle.
function blocks(xml: string, tag: string) {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1] ?? "");
}

function plain(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`))?.[1];
}

function valued(xml: string, tag: string) {
  return xml.match(new RegExp(`<${tag}>\\s*<value>\\s*([^<]*?)\\s*</value>`))?.[1];
}

export function parseForm4(xml: string): ParsedForm4 {
  if (!xml.includes("<ownershipDocument")) throw permanent("not a Form 4 ownership document");
  const flag = plain(xml, "aff10b5One");
  const owners = blocks(xml, "rptOwnerCik").join("+");
  const sales: Sale[] = [];
  let skippedNoPrice = 0;
  for (const row of blocks(xml, "nonDerivativeTransaction")) {
    if (plain(row, "transactionCode") !== "S") continue;
    if (valued(row, "transactionAcquiredDisposedCode") !== "D") continue;
    const date = valued(row, "transactionDate")?.slice(0, 10);
    const shares = Number(valued(row, "transactionShares"));
    const priceText = valued(row, "transactionPricePerShare");
    const price = priceText ? Number(priceText) : Number.NaN;
    if (!date || !Number.isFinite(shares) || shares <= 0) continue;
    if (!Number.isFinite(price) || price <= 0) {
      skippedNoPrice += 1;
      continue;
    }
    const nature = valued(row, "directOrIndirectOwnership") ?? "";
    sales.push({
      transactionDate: date,
      shares,
      price,
      key: [owners, valued(row, "securityTitle"), date, shares, price, nature].join("|"),
    });
  }
  return {
    tenB5One: flag === undefined ? undefined : flag === "1" || flag.toLowerCase() === "true",
    sales,
    skippedNoPrice,
  };
}

// Amendments (4/A) restate an earlier filing and carry no pointer to it, so
// they are matched by content: originals count in full, and an amendment only
// adds sales its predecessors do not already hold, by exact owner, security,
// date, shares, price and ownership nature. A 4/A that corrects a price or
// share count therefore still adds the corrected row next to the original
// wrong one; that case is rare and is accepted rather than guessed at.
export function monthlySales(filings: Form4Filing[], firstMonth?: string): MonthlySales[] {
  const ordered = [...filings].sort(
    (a, b) =>
      Number(a.form === "4/A") - Number(b.form === "4/A") || a.filedAt.localeCompare(b.filedAt),
  );
  const held = new Map<string, number>();
  const months = new Map<string, MonthlySales & { accessions: Set<string> }>();
  for (const filing of ordered) {
    const inFiling = new Map<string, Sale[]>();
    for (const sale of filing.parsed.sales) {
      inFiling.set(sale.key, [...(inFiling.get(sale.key) ?? []), sale]);
    }
    for (const [key, rows] of inFiling) {
      const fresh = filing.form === "4/A" ? rows.length - (held.get(key) ?? 0) : rows.length;
      if (fresh <= 0) continue;
      held.set(key, (held.get(key) ?? 0) + fresh);
      for (const sale of rows.slice(0, fresh)) {
        const month = sale.transactionDate.slice(0, 7);
        if (firstMonth && month < firstMonth) continue;
        const usd = sale.shares * sale.price;
        const entry = months.get(month) ?? {
          month,
          totalUsd: 0,
          tenB5OneUsd: 0,
          tenB5OneKnown: true,
          filings: 0,
          transactions: 0,
          asOf: filing.filedAt,
          accessions: new Set<string>(),
        };
        entry.totalUsd += usd;
        if (filing.parsed.tenB5One) entry.tenB5OneUsd += usd;
        if (filing.parsed.tenB5One === undefined) entry.tenB5OneKnown = false;
        entry.transactions += 1;
        if (filing.filedAt > entry.asOf) entry.asOf = filing.filedAt;
        entry.accessions.add(filing.accession);
        entry.filings = entry.accessions.size;
        months.set(month, entry);
      }
    }
  }
  return [...months.values()]
    .map(({ accessions: _, ...rest }) => rest)
    .sort((a, b) => a.month.localeCompare(b.month));
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Routine runs fetch whole calendar months: the month containing "now minus
// 120 days" through today. A window that starts mid-month would total only
// part of its oldest month and write a lower value that looks like a revision.
// Filing lag is at most two business days, so every sale dated inside a month
// is in a filing dated no earlier than that month's first day.
export function routineWindowStart(now: Date) {
  const back = new Date(now.getTime() - ROUTINE_WINDOW_DAYS * 86_400_000);
  return isoDay(new Date(Date.UTC(back.getUTCFullYear(), back.getUTCMonth(), 1)));
}

const SOURCE_NOTE =
  "Form 4 reports are filed by insiders within two business days of a trade. Only open-market sales (transaction code S, disposed) with a reported price per share are counted: value = shares x price. Sales without a reported price are skipped, never estimated. Option exercises, tax withholding, gifts and grants are excluded. Amendments (4/A) add only sales not already reported. Month is the transaction date. The current month is partial until it ends.";

function seriesDefs(company: SecCompany, withPlan: boolean): SeriesDef[] {
  const base = {
    indicator: "insider_activity" as const,
    entity: company.ticker,
    source: "SEC EDGAR Form 4",
    sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.cik}&type=4&dateb=&owner=include&count=40`,
    unit: "USD",
    currency: "USD",
    cadence: "monthly" as const,
    collector: "sec_insider",
  };
  const defs: SeriesDef[] = [
    {
      ...base,
      id: `insider.${company.ticker}.open_market_sales_usd`,
      label: `${company.ticker} insider open-market sales`,
      methodology: `Calculated: sum of shares x price per share over all open-market sales by directors, officers and 10% owners, by calendar month of the trade. ${SOURCE_NOTE}`,
    },
  ];
  if (withPlan) {
    defs.push({
      ...base,
      id: `insider.${company.ticker}.open_market_sales_10b5_1_usd`,
      label: `${company.ticker} insider sales under 10b5-1 plans`,
      methodology: `Calculated: the part of open-market sales reported on filings that tick the Rule 10b5-1 box (the aff10b5One field). The box applies to the whole filing, so a filing mixing planned and unplanned sales counts entirely as planned and this is an upper bound. Filings before the field was introduced (2023) carry no flag, so months that include them are left out rather than shown as zero. ${SOURCE_NOTE}`,
    });
  }
  return defs;
}

function observationsFor(company: SecCompany, months: MonthlySales[], now: Date) {
  const observations: ObservationInput[] = [];
  const sourceUrl = seriesDefs(company, false)[0]?.sourceUrl;
  for (const m of months) {
    const [year, mon] = m.month.split("-").map(Number) as [number, number];
    const periodStart = `${m.month}-01`;
    const periodEnd = isoDay(new Date(Date.UTC(year, mon, 0)));
    const partial = periodEnd > isoDay(now) ? " Month in progress." : "";
    const note = `${m.filings} Form 4 filings, ${m.transactions} sale transactions.${partial}`;
    const common = {
      periodStart,
      periodEnd,
      kind: "calculated" as const,
      asOf: m.asOf,
      sourceUrl,
      note,
    };
    observations.push({
      ...common,
      seriesId: `insider.${company.ticker}.open_market_sales_usd`,
      value: Math.round(m.totalUsd * 100) / 100,
    });
    if (m.tenB5OneKnown) {
      observations.push({
        ...common,
        seriesId: `insider.${company.ticker}.open_market_sales_10b5_1_usd`,
        value: Math.round(m.tenB5OneUsd * 100) / 100,
      });
    }
  }
  return observations;
}

export function makeSecInsiderCollector(requestGapMs = REQUEST_GAP_MS): Collector {
  return {
    name: "sec_insider",
    description: "Open-market insider sales parsed from SEC Form 4 filings for tracked companies",
    async collect({ fetch, log, backfill, now }: CollectContext): Promise<CollectOutput> {
      const series: SeriesDef[] = [];
      const observations: ObservationInput[] = [];
      const failures: NonNullable<CollectOutput["failures"]> = [];
      const windowStart = routineWindowStart(now);
      let requests = 0;
      const pause = async () => {
        if (requests++ > 0 && requestGapMs > 0)
          await new Promise((resolve) => setTimeout(resolve, requestGapMs));
      };

      for (const company of SEC_FILING_COMPANIES) {
        try {
          await pause();
          const body = await (await fetch(submissionsUrl(company.cik))).text();
          const submissions = parseSubmissions(body);
          const recent = submissions.filings.recent;
          // `recent` holds only the latest ~1000 filings of any form. If older
          // filings sit in extra files, the oldest month it touches may be
          // incomplete, so a backfill starts at the next whole month.
          let firstMonth = backfill ? undefined : windowStart.slice(0, 7);
          if (backfill && (submissions.filings.files?.length ?? 0) > 0) {
            const oldest = [...recent.filingDate].sort()[0];
            if (oldest) {
              const d = new Date(`${oldest}T00:00:00Z`);
              const next = new Date(
                Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (d.getUTCDate() > 1 ? 1 : 0), 1),
              );
              firstMonth = isoDay(next).slice(0, 7);
            }
          }
          const filings: Form4Filing[] = [];
          let skippedNoPrice = 0;
          for (const [index, accession] of recent.accessionNumber.entries()) {
            const form = recent.form[index];
            const filedAt = recent.filingDate[index];
            if (!form || !filedAt || !FORMS.has(form)) continue;
            if (firstMonth && filedAt < `${firstMonth}-01`) continue;
            const name = rawXmlName(recent.primaryDocument?.[index]);
            if (!name) throw permanent(`no XML document for Form 4 ${accession}`);
            await pause();
            const xml = await (await fetch(filingUrl(company.cik, accession, name))).text();
            const parsed = parseForm4(xml);
            skippedNoPrice += parsed.skippedNoPrice;
            filings.push({ accession, form, filedAt, parsed });
          }
          const months = monthlySales(filings, firstMonth);
          const obs = observationsFor(company, months, now);
          if (obs.length > 0) {
            series.push(
              ...seriesDefs(
                company,
                obs.some((o) => o.seriesId.endsWith("_10b5_1_usd")),
              ),
            );
            observations.push(...obs);
          }
          log(
            `${company.ticker}: ${filings.length} Form 4 filings, ${months.length} months with sales, ${skippedNoPrice} sales skipped for no price`,
          );
        } catch (err) {
          // A company with any unreadable filing writes nothing, so a missing
          // filing cannot lower a month's total.
          failures.push({ key: company.ticker, error: classify(err) });
        }
      }
      if (failures.length === SEC_FILING_COMPANIES.length) {
        throw failures[0]?.error ?? permanent("no insider filings collected");
      }
      return { series, observations, failures };
    },
  };
}

export const secInsiderCollector = makeSecInsiderCollector();

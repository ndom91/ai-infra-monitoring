// Headline figures for the chapter pages. Each one is computed from stored
// series only; when it cannot be computed honestly the function returns null
// and the page shows "awaiting data" instead.
import { type Point, snapToCalendarQuarter } from "~/metrics/changes";
import { SEC_FILING_COMPANIES } from "./companies";

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

// Median across a peer group at the latest calendar quarter that at least
// `min` members have reported. Fiscal quarters are snapped to calendar ones.
export function groupMedianAtLatestQuarter(members: Point[][], min = 3) {
  const byQuarter = new Map<string, number[]>();
  for (const points of members) {
    const seen = new Set<string>();
    for (const p of points) {
      const q = snapToCalendarQuarter(p.periodEnd);
      if (!q || seen.has(q)) continue;
      seen.add(q);
      byQuarter.set(q, [...(byQuarter.get(q) ?? []), p.value]);
    }
  }
  const quarter = [...byQuarter.keys()]
    .filter((q) => (byQuarter.get(q)?.length ?? 0) >= min)
    .sort()
    .at(-1);
  if (!quarter) return null;
  const values = byQuarter.get(quarter) ?? [];
  return { quarter, value: median(values) as number, n: values.length };
}

// ---- Issuer debt (data/manual/issuer_debt.yaml) ----

export type IssuedKind = "note" | "convertible" | "loan";

export const ISSUED_KIND_LABELS: Record<IssuedKind, string> = {
  note: "Senior / secured notes",
  convertible: "Convertible",
  loan: "Loan margin over SOFR",
};

// Series ids are issuer_debt.TICKER.instrument.metric.
export function classifyIssuerDebt(id: string): IssuedKind {
  if (id.endsWith(".sofr_spread")) return "loan";
  if (id.includes(".conv_")) return "convertible";
  return "note";
}

// Issuers that are not in the SEC company list (TeraWulf, Cipher).
const ISSUER_NAMES: Record<string, string> = {
  WULF: "TeraWulf",
  CIFR: "Cipher",
};

export function issuerName(ticker: string) {
  return (
    ISSUER_NAMES[ticker] ?? SEC_FILING_COMPANIES.find((c) => c.ticker === ticker)?.name ?? ticker
  );
}

type IssuerSeries = {
  id: string;
  label: string;
  sourceUrl: string;
  points: { periodEnd: string; value: number; sourceUrl?: string | null; quote?: string | null }[];
  latest: { periodEnd: string; value: number; sourceUrl?: string | null } | null;
};

export type IssuedInstrument = {
  id: string;
  ticker: string;
  issuer: string;
  title: string;
  kind: IssuedKind;
  issued: string;
  rate: number;
  sourceUrl: string;
};

// One entry per instrument, dated at its issue (the earliest observation).
// The latest point is always considered, so a page range shorter than the
// issue date does not hide the deal.
export function issuedInstruments(series: IssuerSeries[], since = "2025-01-01") {
  return series
    .filter((s) => s.id.startsWith("issuer_debt."))
    .flatMap((s): IssuedInstrument[] => {
      const first = [...s.points, ...(s.latest ? [s.latest] : [])].sort((a, b) =>
        a.periodEnd.localeCompare(b.periodEnd),
      )[0];
      if (!first || first.periodEnd < since) return [];
      const ticker = s.id.split(".")[1] ?? "";
      return [
        {
          id: s.id,
          ticker,
          issuer: issuerName(ticker),
          title: s.label.replace(/, (coupon at issue|margin over .*)$/, ""),
          kind: classifyIssuerDebt(s.id),
          issued: first.periodEnd,
          rate: first.value,
          sourceUrl: first.sourceUrl ?? s.sourceUrl,
        },
      ];
    })
    .sort((a, b) => b.issued.localeCompare(a.issued) || a.title.localeCompare(b.title));
}

export function issuedSummary(list: IssuedInstrument[]) {
  const rates = (kind: IssuedKind) => list.filter((i) => i.kind === kind).map((i) => i.rate);
  const notes = rates("note");
  const convertibles = rates("convertible");
  return {
    count: list.length,
    issuers: new Set(list.map((i) => i.ticker)).size,
    notes: { n: notes.length, median: median(notes) },
    convertibles: { n: convertibles.length, median: median(convertibles) },
  };
}

export function formatIssuedRate(i: Pick<IssuedInstrument, "kind" | "rate">) {
  const pct = `${+i.rate.toFixed(3)}%`;
  return i.kind === "loan" ? `SOFR + ${pct}` : pct;
}

// ---- Insider sales (monthly Form 4 totals) ----

const monthKey = (iso: string) => iso.slice(0, 7);

function monthsBack(endMonth: string, n: number) {
  const [y = 0, m = 1] = endMonth.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

// Open-market sales over the `months` calendar months ending `endMonth`. A
// month with no point had no priced sale. The planned (10b5-1) share is only
// given when every month with sales also carries the 10b5-1 flag.
export function insiderWindow(total: Point[], planned: Point[], endMonth: string, months = 3) {
  const window = new Set(monthsBack(endMonth, months));
  const inWindow = (ps: Point[]) => ps.filter((p) => window.has(monthKey(p.periodEnd)));
  const sales = inWindow(total);
  const plan = new Map(inWindow(planned).map((p) => [monthKey(p.periodEnd), p.value]));
  const sum = sales.reduce((a, p) => a + p.value, 0);
  const complete = sales.every((p) => plan.has(monthKey(p.periodEnd)));
  const plannedSum = sales.reduce((a, p) => a + (plan.get(monthKey(p.periodEnd)) ?? 0), 0);
  return {
    total: sum,
    months: sales.length,
    plannedShare: sum > 0 && complete ? plannedSum / sum : null,
  };
}

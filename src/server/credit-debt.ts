import { type SeriesView, slimView } from "./views";

const RATE_METRICS = [".stated_rate", ".effective_rate", ".variable_rate_spread"];

// Series ids are sec_debt.TICKER.instrument[.qualifier].metric.
const instrumentOf = (s: SeriesView) => s.id.split(".")[2];

// Instruments with a balance at the company's latest reported date. Repaid and
// renamed instruments are left out so the chart stays readable. Each rate is
// reduced to its latest filed value, with no history.
export function outstandingDebt(series: SeriesView[], ticker: string) {
  const own = series.filter((s) => s.collector === "sec_debt" && s.entity === ticker);
  const carrying = own.filter((s) => s.id.endsWith(".carrying_amount"));
  const latestEnd = carrying
    .map((s) => s.latest?.periodEnd ?? "")
    .sort()
    .at(-1);
  // The methodology is the same long boilerplate per instrument; the chart's
  // explainer covers it, so it is not sent for every instrument.
  const current = carrying
    .filter((s) => s.latest?.periodEnd === latestEnd && (s.latest?.value ?? 0) > 0)
    .map(({ methodology: _, ...s }): SeriesView => s);
  const instruments = new Set(current.map(instrumentOf));
  const rates = own
    .filter((s) => RATE_METRICS.some((m) => s.id.endsWith(m)) && instruments.has(instrumentOf(s)))
    .map(slimView);
  return { ticker, current, rates };
}

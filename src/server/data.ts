import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import * as v from "valibot";
import { SEC_DEBT_COMPANIES } from "~/domain/companies";
import { RANGE_KEYS, type RangeKey, rangeStart } from "~/domain/ranges";
import { INDICATOR_IDS } from "~/domain/types";
import { getDb } from "~/storage/db";
import {
  lastRuns,
  lastSuccessfulRun,
  latestObservations,
  recentAlerts,
  recentFilingEvents,
  recentRuns,
  seriesCountsByIndicator,
  seriesFor,
} from "~/storage/queries";
import { withCurrentWording } from "./alert-text";
import { cacheResponse } from "./cache";
import { outstandingDebt } from "./credit-debt";
import { deriveCompanySeries, TICKERS } from "./derived";
import { RISK_READ_ALERT_LIMIT, riskReadFromAlerts } from "./overview-signals";
import { buildView, groupBySeries, type ObsPoint, type SeriesView } from "./views";

export type { ObsPoint, SeriesView } from "./views";

export const SectionInput = v.object({
  indicators: v.array(v.picklist(INDICATOR_IDS)),
  range: v.picklist(RANGE_KEYS),
  // Load the full history (for TTM/YoY-derived metrics on quarterly data).
  fullHistory: v.optional(v.boolean(), false),
  // Only these series, instead of every series of the indicators.
  seriesIds: v.optional(v.array(v.string())),
  // Narrow the indicators' series by collector or entity (company ticker).
  collectors: v.optional(v.array(v.string())),
  excludeCollectors: v.optional(v.array(v.string())),
  entity: v.optional(v.string()),
});

// Extra history beyond the visible range so YoY comparisons always work.
const CHANGE_LOOKBACK_DAYS = 400;

// Shared by several server functions. Wrapped in createServerOnlyFn so the
// compiler strips it (and the node:fs DB client it imports) from the client
// bundle; a plain exported function would leak it and break hydration.
export const loadSection = createServerOnlyFn(async function loadSection(
  input: v.InferInput<typeof SectionInput>,
  now: Date,
): Promise<{
  series: SeriesView[];
  raw: Map<string, ObsPoint[]>;
  runStatus: Map<string, "running" | "ok" | "partial" | "failed">;
  visibleFrom?: string;
}> {
  const db = getDb();
  const visibleFrom = rangeStart(input.range, now);
  const lookback = new Date(now.getTime() - CHANGE_LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const loadFrom =
    input.fullHistory || !visibleFrom ? undefined : visibleFrom < lookback ? visibleFrom : lookback;

  // One parallel batch: one DB round trip of latency.
  const [defs, runs, rows] = await Promise.all([
    seriesFor(db, input),
    lastRuns(db),
    latestObservations(db, input, loadFrom),
  ]);
  const raw = groupBySeries(rows);
  const runStatus = new Map(runs.map((r) => [r.collector, r.status]));
  const series = defs.map(({ updatedAt: _, ...def }) =>
    buildView(def, raw.get(def.id) ?? [], {
      now,
      visibleFrom,
      lastRunStatus: runStatus.get(def.collector),
    }),
  );
  return { series, raw, runStatus, visibleFrom };
});

export const getSectionData = createServerFn({ method: "GET" })
  .validator(SectionInput)
  .handler(async ({ data }) => {
    cacheResponse();
    const now = new Date();
    const { series, visibleFrom } = await loadSection(data, now);
    return { series, now: now.toISOString(), visibleFrom };
  });

const RangeKeyInput = v.picklist(RANGE_KEYS);

const FUNDAMENTALS_INDICATORS = [
  "capex_cashflow",
  "contract_conversion",
  "customer_concentration",
  "depreciation",
  "insider_activity",
] as const;

// Shared page-wide data: every company's derived metrics and the hand-curated
// series. Derived metrics are computed from the raw SEC series of every
// ticker (TTM and YoY need the full history), but only the results ship.
export const loadFundamentals = createServerOnlyFn(async function loadFundamentals(
  range: RangeKey,
  now: Date,
) {
  const [{ series, raw, runStatus, visibleFrom }, filingEvents] = await Promise.all([
    loadSection(
      {
        indicators: [...FUNDAMENTALS_INDICATORS],
        range,
        fullHistory: true,
        collectors: ["sec", "manual"],
      },
      now,
    ),
    recentFilingEvents(getDb(), 100),
  ]);
  const derived = TICKERS.flatMap((ticker) =>
    deriveCompanySeries(ticker, (concept) => raw.get(`sec.${ticker}.${concept}`) ?? []),
  ).map((d) =>
    buildView(d.def, d.points, { now, visibleFrom, lastRunStatus: runStatus.get("sec") }),
  );
  return {
    series: [...series.filter((s) => s.collector === "manual"), ...derived],
    filingEvents,
    now: now.toISOString(),
    visibleFrom,
  };
});

export const getFundamentalsData = createServerFn({ method: "GET" })
  .validator(v.object({ range: RangeKeyInput }))
  .handler(async ({ data }) => {
    cacheResponse();
    return loadFundamentals(data.range, new Date());
  });

// One company's raw SEC series and insider sales: the charts that change with
// the company picker. Kept apart so the page-wide payload stays small.
export const loadCompanySeries = createServerOnlyFn(async function loadCompanySeries(
  input: { range: RangeKey; company: string },
  now: Date,
) {
  const { series } = await loadSection(
    {
      indicators: [...FUNDAMENTALS_INDICATORS],
      range: input.range,
      collectors: ["sec", "sec_insider"],
      entity: input.company,
    },
    now,
  );
  return series;
});

export const getCompanySeries = createServerFn({ method: "GET" })
  .validator(v.object({ range: RangeKeyInput, company: v.picklist(TICKERS) }))
  .handler(async ({ data }) => {
    cacheResponse();
    return loadCompanySeries(data, new Date());
  });

// Per neocloud / AI lab, the outstanding debt for /credit: carrying-amount
// series plus latest rates. The full sec_debt history is far larger than the
// page uses, so the reduction happens here and not in the browser.
export const loadCreditDebt = createServerOnlyFn(async function loadCreditDebt(
  range: RangeKey,
  company: string,
  now: Date,
) {
  const { series } = await loadSection(
    { indicators: ["credit"], range, collectors: ["sec_debt"], entity: company },
    now,
  );
  return outstandingDebt(series, company);
});

export const getCreditDebt = createServerFn({ method: "GET" })
  .validator(
    v.object({
      range: RangeKeyInput,
      company: v.picklist(SEC_DEBT_COMPANIES.map((c) => c.ticker)),
    }),
  )
  .handler(async ({ data }) => {
    cacheResponse();
    return loadCreditDebt(data.range, data.company, new Date());
  });

// The homepage "Current read", shared so the credit page's market-stress
// status always agrees with it.
export const loadRiskRead = createServerOnlyFn(async function loadRiskRead() {
  return riskReadFromAlerts(withCurrentWording(await recentAlerts(getDb(), RISK_READ_ALERT_LIMIT)));
});

export const getRiskRead = createServerFn({ method: "GET" }).handler(async () => {
  cacheResponse();
  return loadRiskRead();
});

export const getAlertsData = createServerFn({ method: "GET" }).handler(async () => {
  cacheResponse();
  return withCurrentWording(await recentAlerts(getDb(), 200));
});

export const getCoverageData = createServerFn({ method: "GET" }).handler(async () => {
  cacheResponse();
  const db = getDb();
  const [counts, runs, latest] = await Promise.all([
    seriesCountsByIndicator(db),
    recentRuns(db, 20),
    lastRuns(db),
  ]);
  return {
    seriesCounts: Object.fromEntries(counts.map((c) => [c.indicator, c.n])),
    runs,
    latest,
  };
});

export const getLastUpdated = createServerFn({ method: "GET" }).handler(async () => {
  cacheResponse();
  return lastSuccessfulRun(getDb());
});

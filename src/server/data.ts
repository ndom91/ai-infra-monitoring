import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import * as v from "valibot";
import { RANGE_KEYS, rangeStart } from "~/domain/ranges";
import { INDICATOR_IDS } from "~/domain/types";
import { getDb } from "~/storage/db";
import {
  lastRuns,
  lastSuccessfulRun,
  latestObservations,
  recentAlerts,
  recentRuns,
  seriesCountsByIndicator,
  seriesFor,
} from "~/storage/queries";
import { withCurrentWording } from "./alert-text";
import { cacheResponse } from "./cache";
import { deriveCompanySeries, TICKERS } from "./derived";
import { buildView, groupBySeries, type ObsPoint, type SeriesView } from "./views";

export type { ObsPoint, SeriesView } from "./views";

export const SectionInput = v.object({
  indicators: v.array(v.picklist(INDICATOR_IDS)),
  range: v.picklist(RANGE_KEYS),
  // Load the full history (for TTM/YoY-derived metrics on quarterly data).
  fullHistory: v.optional(v.boolean(), false),
  // Only these series, instead of every series of the indicators.
  seriesIds: v.optional(v.array(v.string())),
});

// Extra history beyond the visible range so YoY comparisons always work.
const CHANGE_LOOKBACK_DAYS = 400;

// Shared by several server functions. Wrapped in createServerOnlyFn so the
// compiler strips it (and the node:fs DB client it imports) from the client
// bundle; a plain exported function would leak it and break hydration.
export const loadSection = createServerOnlyFn(async function loadSection(
  input: v.InferOutput<typeof SectionInput>,
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

export const getFundamentalsData = createServerFn({ method: "GET" })
  .validator(v.object({ range: v.picklist(RANGE_KEYS) }))
  .handler(async ({ data }) => {
    cacheResponse();
    const now = new Date();
    const { series, raw, runStatus, visibleFrom } = await loadSection(
      {
        indicators: [
          "capex_cashflow",
          "contract_conversion",
          "customer_concentration",
          "depreciation",
        ],
        range: data.range,
        fullHistory: true,
      },
      now,
    );
    const derived = TICKERS.flatMap((ticker) =>
      deriveCompanySeries(ticker, (concept) => raw.get(`sec.${ticker}.${concept}`) ?? []),
    ).map((d) =>
      buildView(d.def, d.points, { now, visibleFrom, lastRunStatus: runStatus.get("sec") }),
    );
    return { series: [...series, ...derived], now: now.toISOString(), visibleFrom };
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
    recentRuns(db, 100),
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

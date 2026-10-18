import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import * as v from "valibot";
import { RANGE_KEYS, rangeStart } from "~/domain/ranges";
import { INDICATOR_IDS } from "~/domain/types";
import { getDb } from "~/storage/db";
import {
  allSeries,
  lastRuns,
  lastSuccessfulRun,
  latestObservations,
  recentAlerts,
  recentRuns,
  seriesForIndicators,
} from "~/storage/queries";
import { deriveCompanySeries, TICKERS } from "./derived";
import { buildView, groupBySeries, type ObsPoint, type SeriesView } from "./views";

export type { ObsPoint, SeriesView } from "./views";

export const SectionInput = v.object({
  indicators: v.array(v.picklist(INDICATOR_IDS)),
  range: v.picklist(RANGE_KEYS),
  // Load the full history (for TTM/YoY-derived metrics on quarterly data).
  fullHistory: v.optional(v.boolean(), false),
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

  const [defs, runs] = await Promise.all([seriesForIndicators(db, input.indicators), lastRuns(db)]);
  const rows = await latestObservations(
    db,
    defs.map((d) => d.id),
    loadFrom,
  );
  const raw = groupBySeries(rows.map(({ collectedAt: _, ...r }) => r));
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
    const now = new Date();
    const { series, visibleFrom } = await loadSection(data, now);
    return { series, now: now.toISOString(), visibleFrom };
  });

export const getFundamentalsData = createServerFn({ method: "GET" })
  .validator(v.object({ range: v.picklist(RANGE_KEYS) }))
  .handler(async ({ data }) => {
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

export const getStatusData = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const [series, runs, latest, alerts] = await Promise.all([
    allSeries(db),
    recentRuns(db, 100),
    lastRuns(db),
    recentAlerts(db, 200),
  ]);
  return { series, runs, latest, alerts, now: new Date().toISOString() };
});

export const getLastUpdated = createServerFn({ method: "GET" }).handler(async () =>
  lastSuccessfulRun(getDb()),
);

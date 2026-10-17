import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { type Freshness, freshness } from "~/domain/freshness";
import { RANGE_KEYS, rangeStart } from "~/domain/ranges";
import { type Cadence, INDICATOR_IDS } from "~/domain/types";
import { type Change, changeFromPrior, changeOver } from "~/metrics/changes";
import { getDb } from "~/storage/db";
import {
  allSeries,
  lastRuns,
  latestObservations,
  recentAlerts,
  recentRuns,
  type SeriesRow,
  seriesForIndicators,
} from "~/storage/queries";

export type ObsPoint = {
  id: number;
  periodStart: string;
  periodEnd: string;
  value: number;
  kind: string;
  asOf: string | null;
  sourceUrl: string | null;
  note: string | null;
};

export type SeriesView = Omit<SeriesRow, "updatedAt"> & {
  points: ObsPoint[];
  latest: ObsPoint | null;
  freshness: Freshness;
  changes: {
    m3: Change | null;
    m6: Change | null;
    y1: Change | null;
    prior: Change | null;
  };
};

const SectionInput = v.object({
  indicators: v.array(v.picklist(INDICATOR_IDS)),
  range: v.picklist(RANGE_KEYS),
});

// Extra history beyond the visible range so YoY comparisons always work.
const CHANGE_LOOKBACK_DAYS = 400;

export const getSectionData = createServerFn({ method: "GET" })
  .validator(SectionInput)
  .handler(async ({ data }) => {
    const db = getDb();
    const now = new Date();
    const visibleFrom = rangeStart(data.range, now);
    const lookback = new Date(now.getTime() - CHANGE_LOOKBACK_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const loadFrom = visibleFrom && visibleFrom < lookback ? visibleFrom : visibleFrom && lookback;

    const [defs, runs] = await Promise.all([
      seriesForIndicators(db, data.indicators),
      lastRuns(db),
    ]);
    const rows = await latestObservations(
      db,
      defs.map((d) => d.id),
      loadFrom ?? undefined,
    );
    const bySeries = new Map<string, ObsPoint[]>();
    for (const { seriesId, collectedAt: _, ...p } of rows) {
      const list = bySeries.get(seriesId) ?? [];
      list.push(p);
      bySeries.set(seriesId, list);
    }
    const runStatus = new Map(runs.map((r) => [r.collector, r.status]));

    const series: SeriesView[] = defs.map(({ updatedAt: _, ...def }) => {
      const all = bySeries.get(def.id) ?? [];
      const latest = all.at(-1) ?? null;
      return {
        ...def,
        points: visibleFrom ? all.filter((p) => p.periodEnd >= visibleFrom) : all,
        latest,
        freshness: freshness({
          cadence: def.cadence as Cadence,
          latestPeriodEnd: latest?.periodEnd,
          lastRunStatus: runStatus.get(def.collector),
          now,
        }),
        changes: {
          m3: changeOver(all, 91),
          m6: changeOver(all, 182),
          y1: changeOver(all, 365),
          prior: changeFromPrior(all),
        },
      };
    });
    return { series, runs, now: now.toISOString(), visibleFrom };
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

import { and, desc, eq, gte, inArray, max } from "drizzle-orm";
import type { IndicatorId } from "~/domain/types";
import type { Db } from "./db";
import { alertEvents, collectorRuns, observations, series } from "./schema";

export type SeriesRow = typeof series.$inferSelect;
export type RunRow = typeof collectorRuns.$inferSelect;

export function seriesForIndicators(db: Db, indicators: IndicatorId[]) {
  return db.select().from(series).where(inArray(series.indicator, indicators)).orderBy(series.id);
}

// Latest vintage only; uses the (series_id, is_latest, period_end) index.
export function latestObservations(db: Db, seriesIds: string[], since?: string) {
  if (seriesIds.length === 0) return Promise.resolve([]);
  return db
    .select({
      id: observations.id,
      seriesId: observations.seriesId,
      periodStart: observations.periodStart,
      periodEnd: observations.periodEnd,
      value: observations.value,
      kind: observations.kind,
      asOf: observations.asOf,
      sourceUrl: observations.sourceUrl,
      note: observations.note,
      collectedAt: observations.collectedAt,
    })
    .from(observations)
    .where(
      and(
        inArray(observations.seriesId, seriesIds),
        eq(observations.isLatest, true),
        since ? gte(observations.periodEnd, since) : undefined,
      ),
    )
    .orderBy(observations.seriesId, observations.periodEnd);
}

// Most recent run per collector.
export async function lastRuns(db: Db) {
  const latest = await db
    .select({ collector: collectorRuns.collector, id: max(collectorRuns.id) })
    .from(collectorRuns)
    .groupBy(collectorRuns.collector);
  const ids = latest.flatMap((r) => (r.id == null ? [] : [r.id]));
  if (ids.length === 0) return [];
  return db.select().from(collectorRuns).where(inArray(collectorRuns.id, ids));
}

export function recentRuns(db: Db, limit = 50) {
  return db.select().from(collectorRuns).orderBy(desc(collectorRuns.id)).limit(limit);
}

export function recentAlerts(db: Db, limit = 100) {
  return db
    .select()
    .from(alertEvents)
    .orderBy(desc(alertEvents.triggeredAt), desc(alertEvents.id))
    .limit(limit);
}

export function allSeries(db: Db) {
  return db.select().from(series).orderBy(series.indicator, series.id);
}

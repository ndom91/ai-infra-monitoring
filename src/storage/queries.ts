import { and, count, desc, eq, gte, inArray, max, type SQL } from "drizzle-orm";
import type { IndicatorId } from "~/domain/types";
import type { Db } from "./db";
import { alertEvents, collectorRuns, observations, series } from "./schema";

export type SeriesRow = typeof series.$inferSelect;
export type RunRow = typeof collectorRuns.$inferSelect;

// What to load: whole indicators, or an exact list of series.
export type SeriesSelection = { indicators: IndicatorId[]; seriesIds?: string[] };

// Indicator selection uses a subquery, so observations come back in the same
// round trip as the series definitions instead of waiting for them.
function seriesIdFilter(db: Db, sel: SeriesSelection): SQL {
  return sel.seriesIds
    ? inArray(observations.seriesId, sel.seriesIds)
    : inArray(
        observations.seriesId,
        db.select({ id: series.id }).from(series).where(inArray(series.indicator, sel.indicators)),
      );
}

export function seriesFor(db: Db, sel: SeriesSelection) {
  return db
    .select()
    .from(series)
    .where(
      sel.seriesIds ? inArray(series.id, sel.seriesIds) : inArray(series.indicator, sel.indicators),
    )
    .orderBy(series.id);
}

// Latest vintage only; uses the (series_id, is_latest, period_end) index.
export function latestObservations(db: Db, sel: SeriesSelection, since?: string) {
  if ((sel.seriesIds ?? sel.indicators).length === 0) return Promise.resolve([]);
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
      quote: observations.quote,
    })
    .from(observations)
    .where(
      and(
        seriesIdFilter(db, sel),
        eq(observations.isLatest, true),
        since ? gte(observations.periodEnd, since) : undefined,
      ),
    )
    .orderBy(observations.seriesId, observations.periodEnd);
}

// Most recent run per collector, in one query.
export function lastRuns(db: Db) {
  const latestIds = db
    .select({ id: max(collectorRuns.id) })
    .from(collectorRuns)
    .groupBy(collectorRuns.collector);
  return db.select().from(collectorRuns).where(inArray(collectorRuns.id, latestIds));
}

export function seriesCountsByIndicator(db: Db) {
  return db
    .select({ indicator: series.indicator, n: count() })
    .from(series)
    .groupBy(series.indicator);
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

// When data last landed: the newest run that wrote something (ok or partial).
export async function lastSuccessfulRun(db: Db) {
  const [row] = await db
    .select({ finishedAt: collectorRuns.finishedAt })
    .from(collectorRuns)
    .where(inArray(collectorRuns.status, ["ok", "partial"]))
    .orderBy(desc(collectorRuns.id))
    .limit(1);
  return row?.finishedAt ?? null;
}

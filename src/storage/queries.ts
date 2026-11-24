import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  max,
  ne,
  notInArray,
  type SQL,
  sql,
} from "drizzle-orm";
import { unionAll } from "drizzle-orm/sqlite-core";
import type { IndicatorId } from "~/domain/types";
import type { Db } from "./db";
import { alertEvents, collectorRuns, filingEvents, observations, series } from "./schema";

export type SeriesRow = typeof series.$inferSelect;
export type RunRow = typeof collectorRuns.$inferSelect;
export type FilingEventRow = typeof filingEvents.$inferSelect;

// What to load: whole indicators, or an exact list of series (an empty list of
// indicators then adds no restriction). The optional filters narrow either.
export type SeriesSelection = {
  indicators: IndicatorId[];
  seriesIds?: string[];
  collectors?: string[];
  excludeCollectors?: string[];
  entity?: string;
};

function seriesWhere(sel: SeriesSelection): SQL | undefined {
  return and(
    sel.seriesIds ? inArray(series.id, sel.seriesIds) : undefined,
    sel.seriesIds && sel.indicators.length === 0
      ? undefined
      : inArray(series.indicator, sel.indicators),
    sel.collectors ? inArray(series.collector, sel.collectors) : undefined,
    sel.excludeCollectors ? notInArray(series.collector, sel.excludeCollectors) : undefined,
    sel.entity ? eq(series.entity, sel.entity) : undefined,
  );
}

export function seriesFor(db: Db, sel: SeriesSelection) {
  return db.select().from(series).where(seriesWhere(sel)).orderBy(series.id);
}

// Decoding a row costs CPU on every render, and most of an observation's width
// is provenance (source URL, note, quote) that only some points ever show. So
// the history is loaded narrow, and the wide columns only where they are read:
// every point of a hand-entered (`manual`) series, and each series' latest
// point (the stats tables and the quote popover).
const NARROW = {
  seriesId: observations.seriesId,
  periodEnd: observations.periodEnd,
  value: observations.value,
  kind: observations.kind,
};

const WIDE = {
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
};

type ObservationColumns = typeof observations.$inferSelect;
export type NarrowObservationRow = Pick<
  ObservationColumns,
  "seriesId" | "periodEnd" | "value" | "kind"
>;
export type ObservationRow = NarrowObservationRow &
  Partial<Omit<ObservationColumns, keyof NarrowObservationRow>>;

// Latest vintage only; uses the (series_id, is_latest, period_end) index. Rows
// are ascending by period within a series, and each series' last row is the
// full one. The narrow and wide statements run as one parallel batch.
export async function latestObservations(
  db: Db,
  sel: SeriesSelection,
  since?: string,
): Promise<ObservationRow[]> {
  if ((sel.seriesIds ?? sel.indicators).length === 0) return [];
  const sinceFilter = since ? gte(observations.periodEnd, since) : undefined;
  const selected = (manual: boolean) =>
    db
      .select({ id: series.id })
      .from(series)
      .where(and(seriesWhere(sel), (manual ? eq : ne)(series.collector, "manual")));

  // Hand-entered series are loaded whole by the wide statement alone.
  const onlyManual = sel.collectors?.every((c) => c === "manual");
  const narrow = onlyManual
    ? Promise.resolve([] as NarrowObservationRow[])
    : db
        .select(NARROW)
        .from(observations)
        .where(
          and(
            inArray(observations.seriesId, selected(false)),
            eq(observations.isLatest, true),
            sinceFilter,
          ),
        )
        .orderBy(observations.seriesId, observations.periodEnd);

  // Wide rows: every row of the manual series, plus the newest row of each
  // other series. The newest is found per series with an index seek, so the
  // history is not read a second time.
  const wide = unionAll(
    db
      .select(WIDE)
      .from(observations)
      .where(
        and(
          inArray(observations.seriesId, selected(true)),
          eq(observations.isLatest, true),
          sinceFilter,
        ),
      ),
    db
      .select(WIDE)
      .from(series)
      .crossJoin(observations)
      .where(
        and(
          seriesWhere(sel),
          ne(series.collector, "manual"),
          eq(observations.seriesId, series.id),
          eq(observations.isLatest, true),
          eq(
            observations.periodEnd,
            sql`(select max(o2.period_end) from ${observations} as o2 where o2.series_id = ${series.id} and o2.is_latest = 1${since ? sql` and o2.period_end >= ${since}` : sql``})`,
          ),
        ),
      ),
  );

  const [narrowRows, wideRows] = await Promise.all([narrow, wide]);
  return mergeObservationRows(narrowRows, wideRows);
}

function byPeriod(
  a: { seriesId: string; periodEnd: string },
  b: { seriesId: string; periodEnd: string },
) {
  if (a.seriesId !== b.seriesId) return a.seriesId < b.seriesId ? -1 : 1;
  return a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0;
}

// Swaps each narrow row for the wide row of the same series and period, and
// appends the wide rows with no narrow counterpart (the manual series).
// `narrow` is ordered by series then period.
export function mergeObservationRows(
  narrow: NarrowObservationRow[],
  wide: ObservationRow[],
): ObservationRow[] {
  const wideByKey = new Map(wide.map((w) => [`${w.seriesId}\u0000${w.periodEnd}`, w]));
  const narrowSeries = new Set<string>();
  const used = new Set<ObservationRow>();
  let previous: string | undefined;
  const out: ObservationRow[] = narrow.map((n) => {
    if (n.seriesId !== previous) {
      narrowSeries.add(n.seriesId);
      previous = n.seriesId;
    }
    const w = wideByKey.get(`${n.seriesId}\u0000${n.periodEnd}`);
    if (!w) return n;
    used.add(w);
    return w;
  });
  const rest = wide.filter((w) => !used.has(w)).sort(byPeriod);
  out.push(...rest);
  // A leftover row for a series that also has narrow rows means the data
  // changed between the two statements; put the series back in order.
  if (rest.some((w) => narrowSeries.has(w.seriesId))) out.sort(byPeriod);
  return out;
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

export function recentFilingEvents(db: Db, limit = 100) {
  return db.select().from(filingEvents).orderBy(desc(filingEvents.filedAt)).limit(limit);
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

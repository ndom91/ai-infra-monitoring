import { type Freshness, freshness } from "~/domain/freshness";
import type { Cadence } from "~/domain/types";
import { type Change, changeFromPrior, changeOver } from "~/metrics/changes";
import type { SeriesRow } from "~/storage/queries";

export type ObsPoint = {
  id: number;
  periodStart: string;
  periodEnd: string;
  value: number;
  kind: string;
  asOf: string | null;
  sourceUrl: string | null;
  note: string | null;
  quote?: string | null;
};

// What the UI needs. Provenance fields (quote, source, note) ship only where
// the UI shows them per point: manual series (TermsTable rows) and `latest`.
// `kind` is left out when it is "reported", the common case.
export type ChartPoint = Pick<ObsPoint, "periodEnd" | "value"> &
  Partial<Omit<ObsPoint, "periodEnd" | "value">>;

// Drops what no component reads (id, periodStart, asOf) and null fields.
function trimLatest({ id: _i, periodStart: _p, asOf: _a, ...p }: ObsPoint): ChartPoint {
  return Object.fromEntries(
    Object.entries(p).filter(([k, v]) => v != null && !(k === "kind" && v === "reported")),
  ) as ChartPoint;
}

export type SeriesDefView = Omit<SeriesRow, "updatedAt">;

// `changes` and `methodology` (a tooltip) are optional: rows that only list a
// latest value (see slimView) leave them out to keep the payload small.
export type SeriesView = Omit<SeriesDefView, "methodology"> & {
  methodology?: string;
  points: ChartPoint[];
  latest: ChartPoint | null;
  freshness: Freshness;
  changes?: {
    m3: Change | null;
    m6: Change | null;
    y1: Change | null;
    prior: Change | null;
  };
};

// For series shown only as a latest-value row: no points, changes or tooltip text.
export function slimView({ changes: _c, methodology: _m, ...rest }: SeriesView): SeriesView {
  return { ...rest, points: [] };
}

// A change holds its two observations whole (source URLs, notes); the UI reads
// only their dates and values.
function trimChange(c: Change | null): Change | null {
  if (!c) return null;
  const { from, to } = c;
  return {
    ...c,
    from: { periodEnd: from.periodEnd, value: from.value },
    to: { periodEnd: to.periodEnd, value: to.value },
  };
}

// `all` is the full loaded history (ascending); `points` is what the chart shows.
export function buildView(
  def: SeriesDefView,
  all: ObsPoint[],
  ctx: { now: Date; visibleFrom?: string; lastRunStatus?: "running" | "ok" | "partial" | "failed" },
): SeriesView {
  const latest = all.at(-1) ?? null;
  const visible = ctx.visibleFrom ? all.filter((p) => p.periodEnd >= (ctx.visibleFrom ?? "")) : all;
  return {
    ...def,
    points:
      def.collector === "manual"
        ? visible
        : visible.map(({ periodEnd, value, kind }) =>
            kind === "reported" ? { periodEnd, value } : { periodEnd, value, kind },
          ),
    latest: latest && trimLatest(latest),
    freshness: freshness({
      cadence: def.cadence as Cadence,
      latestPeriodEnd: latest?.periodEnd,
      lastRunStatus: ctx.lastRunStatus,
      now: ctx.now,
    }),
    changes: {
      m3: trimChange(changeOver(all, 91)),
      m6: trimChange(changeOver(all, 182)),
      y1: trimChange(changeOver(all, 365)),
      prior: trimChange(changeFromPrior(all)),
    },
  };
}

export function groupBySeries<T extends { seriesId: string }>(rows: T[]) {
  const map = new Map<string, Omit<T, "seriesId">[]>();
  for (const { seriesId, ...rest } of rows) {
    const list = map.get(seriesId) ?? [];
    list.push(rest);
    map.set(seriesId, list);
  }
  return map;
}

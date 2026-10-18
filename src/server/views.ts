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

// What charts need. Provenance fields (quote, source, note) ship only where the
// UI shows them per point: manual series (TermsTable rows) and `latest`.
export type ChartPoint = Pick<ObsPoint, "periodEnd" | "value" | "kind"> &
  Partial<Omit<ObsPoint, "periodEnd" | "value" | "kind">>;

export type SeriesDefView = Omit<SeriesRow, "updatedAt">;

export type SeriesView = SeriesDefView & {
  points: ChartPoint[];
  latest: ObsPoint | null;
  freshness: Freshness;
  changes: {
    m3: Change | null;
    m6: Change | null;
    y1: Change | null;
    prior: Change | null;
  };
};

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
        : visible.map(({ periodEnd, value, kind }) => ({ periodEnd, value, kind })),
    latest,
    freshness: freshness({
      cadence: def.cadence as Cadence,
      latestPeriodEnd: latest?.periodEnd,
      lastRunStatus: ctx.lastRunStatus,
      now: ctx.now,
    }),
    changes: {
      m3: changeOver(all, 91),
      m6: changeOver(all, 182),
      y1: changeOver(all, 365),
      prior: changeFromPrior(all),
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

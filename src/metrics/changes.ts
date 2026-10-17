export type Point = { periodEnd: string; value: number };

const DAY_MS = 86_400_000;

// Latest point on or before `date`. Points must be sorted ascending.
export function valueAtOrBefore(points: Point[], date: string) {
  let found: Point | undefined;
  for (const p of points) {
    if (p.periodEnd > date) break;
    found = p;
  }
  return found;
}

export type Change = {
  from: Point;
  to: Point;
  delta: number;
  pct: number | null;
};

// Compares the latest point to the one ~`days` earlier. The comparison point
// must fall within `toleranceDays` of the target, otherwise there is no
// honest comparison (e.g. a gap in the series) and we return null.
export function changeOver(
  points: Point[],
  days: number,
  toleranceDays = Math.max(7, days * 0.2),
): Change | null {
  const to = points.at(-1);
  if (!to) return null;
  const target = new Date(Date.parse(to.periodEnd) - days * DAY_MS).toISOString().slice(0, 10);
  const from = valueAtOrBefore(points, target);
  if (!from) return null;
  const gap = (Date.parse(target) - Date.parse(from.periodEnd)) / DAY_MS;
  if (gap > toleranceDays) return null;
  return {
    from,
    to,
    delta: to.value - from.value,
    pct: from.value === 0 ? null : (to.value - from.value) / Math.abs(from.value),
  };
}

// Change from the previous observation, for quarterly/semiannual series where
// "prior reporting period" is the meaningful comparison.
export function changeFromPrior(points: Point[]): Change | null {
  const to = points.at(-1);
  const from = points.at(-2);
  if (!to || !from) return null;
  return {
    from,
    to,
    delta: to.value - from.value,
    pct: from.value === 0 ? null : (to.value - from.value) / Math.abs(from.value),
  };
}

// Samples a (usually daily) series at the dates of a lower-frequency series,
// taking the last value on or before each date. Dates with no value within
// `toleranceDays` are skipped rather than filled.
export function resampleAt(points: Point[], dates: string[], toleranceDays = 10): Point[] {
  const out: Point[] = [];
  for (const date of dates) {
    const p = valueAtOrBefore(points, date);
    if (!p) continue;
    if ((Date.parse(date) - Date.parse(p.periodEnd)) / DAY_MS > toleranceDays) continue;
    out.push({ periodEnd: date, value: p.value });
  }
  return out;
}

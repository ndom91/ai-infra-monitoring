import type { Cadence } from "~/domain/types";

// Longest gap, in days, between two consecutive points that still reads as
// "the next observation". Anything longer is a hole in the data. Limits sit
// well above the cadence so fiscal quarters (~98 days) and holidays never
// break a line. Irregular series have no expected spacing, so they never break.
const MAX_GAP_DAYS: Partial<Record<Cadence, number>> = {
  daily: 10,
  weekdays: 10,
  weekly: 21,
  monthly: 62,
  quarterly: 140,
  semiannual: 280,
  annual: 560,
};

const DAY_MS = 86_400_000;

export type GapPoint = { x: number; y: number | null; kind?: string; marker?: boolean };

type Input = { periodEnd: string; value: number; kind?: string };

// Chart data for one line. Where two neighbours are further apart than the
// cadence allows, a null point sits between them so Chart.js leaves the line
// open instead of drawing a straight run across missing periods. Points must
// be ascending by `periodEnd`. `kind` rides along so tooltips and marker
// styles can read it from the data item, whose index shifts when a break is
// inserted.
export function chartData(
  points: Input[],
  cadence?: Cadence,
  yOf: (p: Input) => number = (p) => p.value,
): GapPoint[] {
  const limit = cadence ? MAX_GAP_DAYS[cadence] : undefined;
  const out: GapPoint[] = [];
  let prev: number | undefined;
  for (const p of points) {
    const x = Date.parse(p.periodEnd);
    if (limit !== undefined && prev !== undefined && x - prev > limit * DAY_MS) {
      out.push({ x: prev + (x - prev) / 2, y: null });
    }
    out.push({ x, y: yOf(p), kind: p.kind });
    prev = x;
  }
  return out;
}

// For a stepped line, flags where a marker belongs: the first and last point,
// the start of each run after a break, and every point whose value differs
// from the one before. Daily list prices that hold still would otherwise draw
// a marker per day.
export function flagStepChanges(data: GapPoint[]): GapPoint[] {
  let last = -1;
  data.forEach((d, i) => {
    if (d.y !== null) last = i;
  });
  let prev: number | null = null;
  return data.map((d, i) => {
    if (d.y === null) {
      prev = null;
      return d;
    }
    const marker = prev === null || d.y !== prev || i === last;
    prev = d.y;
    return marker ? { ...d, marker } : d;
  });
}

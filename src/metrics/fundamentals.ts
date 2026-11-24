// Derived fundamentals computed from raw quarterly observations. Inputs are
// discrete quarters (flows) or quarter-end balances (instants); every
// function aligns inputs on exact periodEnd and returns only periods where
// all inputs exist. Nothing is interpolated.

export type QuarterPoint = { periodEnd: string; value: number };

const DAY_MS = 86_400_000;

// Days from time `from` to time `to`, both in ms.
const daysBetween = (from: number, to: number) => (to - from) / DAY_MS;

// Consecutive quarter-ends are 89-92 days apart (13-week quarters: 91).
const MIN_QUARTER_GAP_DAYS = 80;
const MAX_QUARTER_GAP_DAYS = 100;
// One year back, allowing for 52/53-week fiscal years.
const MIN_YEAR_GAP_DAYS = 350;
const MAX_YEAR_GAP_DAYS = 380;

const isQuarterGap = (days: number) => days >= MIN_QUARTER_GAP_DAYS && days <= MAX_QUARTER_GAP_DAYS;

// Ascending by period end, equal ends in input order. Dates are ISO strings,
// so plain comparison sorts them; input that is already in order (the usual
// case) is returned as is. Callers never modify the result.
function sorted(points: QuarterPoint[]) {
  let inOrder = true;
  for (let i = 1; i < points.length && inOrder; i++) {
    inOrder = (points[i - 1] as QuarterPoint).periodEnd <= (points[i] as QuarterPoint).periodEnd;
  }
  if (inOrder) return points;
  return [...points].sort((a, b) =>
    a.periodEnd < b.periodEnd ? -1 : a.periodEnd > b.periodEnd ? 1 : 0,
  );
}

function byEnd(points: QuarterPoint[]) {
  return new Map(points.map((p) => [p.periodEnd, p.value]));
}

// Trailing-twelve-month sum. Requires four consecutive quarters; a missing
// quarter produces no value rather than a partial sum.
export function ttm(points: QuarterPoint[]): QuarterPoint[] {
  const s = sorted(points);
  const times = s.map((p) => Date.parse(p.periodEnd));
  const out: QuarterPoint[] = [];
  // Consecutive quarter-end gaps ending at i (a window needs three).
  let run = 0;
  for (let i = 1; i < s.length; i++) {
    run = isQuarterGap(daysBetween(times[i - 1] as number, times[i] as number)) ? run + 1 : 0;
    if (run < 3) continue;
    const [a, b, c, d] = [s[i - 3], s[i - 2], s[i - 1], s[i]] as [
      QuarterPoint,
      QuarterPoint,
      QuarterPoint,
      QuarterPoint,
    ];
    // Summed in window order from 0, as a reduce would.
    out.push({ periodEnd: d.periodEnd, value: 0 + a.value + b.value + c.value + d.value });
  }
  return out;
}

// One ttm per input within a derivation: several metrics sum the same series.
export function memoizedTtm(): typeof ttm {
  const cache = new Map<QuarterPoint[], QuarterPoint[]>();
  return (points) => {
    let result = cache.get(points);
    if (!result) {
      result = ttm(points);
      cache.set(points, result);
    }
    return result;
  };
}

// Combines series that share a periodEnd. `fn` returns undefined to skip a
// period (e.g. a non-positive denominator).
function align(
  inputs: QuarterPoint[][],
  fn: (values: number[]) => number | undefined,
): QuarterPoint[] {
  const [first, ...rest] = inputs;
  if (!first) return [];
  const maps = rest.map(byEnd);
  const out: QuarterPoint[] = [];
  for (const p of sorted(first)) {
    const values = [p.value];
    for (const m of maps) {
      const v = m.get(p.periodEnd);
      if (v === undefined) break;
      values.push(v);
    }
    if (values.length !== inputs.length) continue;
    const value = fn(values);
    if (value === undefined || !Number.isFinite(value)) continue;
    out.push({ periodEnd: p.periodEnd, value });
  }
  return out;
}

// Capex / operating cash flow. Skipped when OCF <= 0: the ratio has no
// meaning when operations consume cash.
export function capexToOcf(capex: QuarterPoint[], ocf: QuarterPoint[]): QuarterPoint[] {
  return align([capex, ocf], ([c = 0, o = 0]) => (o > 0 ? c / o : undefined));
}

// Free cash flow after capex: OCF - capex (capex as a positive outflow).
export function fcfAfterCapex(ocf: QuarterPoint[], capex: QuarterPoint[]): QuarterPoint[] {
  return align([ocf, capex], ([o = 0, c = 0]) => o - c);
}

// Cash interest coverage: (OCF + cash interest paid) / cash interest paid.
// OCF is after interest, so interest is added back. Skipped when interest
// paid <= 0.
export function interestCoverage(
  ocf: QuarterPoint[],
  interestPaid: QuarterPoint[],
): QuarterPoint[] {
  return align([ocf, interestPaid], ([o = 0, i = 0]) => (i > 0 ? (o + i) / i : undefined));
}

// (Long-term debt + finance lease liabilities) / TTM operating cash flow.
// Takes quarterly OCF and computes TTM itself. Skipped when TTM OCF <= 0.
export function debtToOcf(
  debt: QuarterPoint[],
  financeLeases: QuarterPoint[],
  ocfQuarterly: QuarterPoint[],
  ttmOf = ttm,
): QuarterPoint[] {
  return align([debt, financeLeases, ttmOf(ocfQuarterly)], ([d = 0, l = 0, o = 0]) =>
    o > 0 ? (d + l) / o : undefined,
  );
}

// The value one year before `periodEnd` (350-380 days, for 52/53-week fiscal
// years): the latest point in that band. `s` is ascending, so the band is one
// run of points and a binary search finds its end.
function priorYearValue(s: QuarterPoint[], times: number[], periodEnd: string) {
  const at = Date.parse(periodEnd);
  // First point less than MIN_YEAR_GAP_DAYS before `at`; the one before it is
  // the latest point at least that far back.
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((at - (times[mid] as number)) / DAY_MS >= MIN_YEAR_GAP_DAYS) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1;
  if (i < 0 || daysBetween(times[i] as number, at) > MAX_YEAR_GAP_DAYS) return undefined;
  return (s[i] as QuarterPoint).value;
}

// TTM revenue / RPO one year earlier: how much of last year's contracted
// backlog the company actually turned into revenue. Skipped when the prior
// RPO is missing or <= 0.
export function rpoConversion(
  revenueQuarterly: QuarterPoint[],
  rpo: QuarterPoint[],
  ttmOf = ttm,
): QuarterPoint[] {
  const r = sorted(rpo);
  const times = r.map((p) => Date.parse(p.periodEnd));
  const out: QuarterPoint[] = [];
  for (const p of ttmOf(revenueQuarterly)) {
    const prior = priorYearValue(r, times, p.periodEnd);
    if (prior === undefined || prior <= 0) continue;
    out.push({ periodEnd: p.periodEnd, value: p.value / prior });
  }
  return out;
}

// Year-over-year growth as a fraction (0.25 = +25%). Skipped when the
// prior-year value is missing or <= 0, where growth is undefined.
export function growthYoY(points: QuarterPoint[]): QuarterPoint[] {
  const s = sorted(points);
  const times = s.map((p) => Date.parse(p.periodEnd));
  const out: QuarterPoint[] = [];
  for (const p of s) {
    const prior = priorYearValue(s, times, p.periodEnd);
    if (prior === undefined || prior <= 0) continue;
    out.push({ periodEnd: p.periodEnd, value: p.value / prior - 1 });
  }
  return out;
}

// Days sales outstanding: receivables / quarterly revenue x 91. Uses the
// quarterly (not TTM) flow so seasonality shows; quarters are about 91 days.
// Skipped when quarterly revenue <= 0.
export function dso(ar: QuarterPoint[], revenueQuarterly: QuarterPoint[]): QuarterPoint[] {
  return align([ar, revenueQuarterly], ([a = 0, r = 0]) => (r > 0 ? (a / r) * 91 : undefined));
}

// Inventory days: inventory / quarterly cost of revenue x 91. Skipped when
// quarterly cost of revenue <= 0.
export function inventoryDays(
  inventory: QuarterPoint[],
  cogsQuarterly: QuarterPoint[],
): QuarterPoint[] {
  return align([inventory, cogsQuarterly], ([i = 0, c = 0]) => (c > 0 ? (i / c) * 91 : undefined));
}

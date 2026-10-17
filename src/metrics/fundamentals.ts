// Derived fundamentals computed from raw quarterly observations. Inputs are
// discrete quarters (flows) or quarter-end balances (instants); every
// function aligns inputs on exact periodEnd and returns only periods where
// all inputs exist. Nothing is interpolated.

export type QuarterPoint = { periodEnd: string; value: number };

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string) {
	return (Date.parse(b) - Date.parse(a)) / DAY_MS;
}

// Consecutive quarter-ends are 89-92 days apart (13-week quarters: 91).
function isNextQuarter(prev: string, next: string) {
	const d = daysBetween(prev, next);
	return d >= 80 && d <= 100;
}

// One year back, allowing for 52/53-week fiscal years.
function isPriorYear(prior: string, current: string) {
	const d = daysBetween(prior, current);
	return d >= 350 && d <= 380;
}

function sorted(points: QuarterPoint[]) {
	return [...points].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
}

function byEnd(points: QuarterPoint[]) {
	return new Map(points.map((p) => [p.periodEnd, p.value]));
}

// Trailing-twelve-month sum. Requires four consecutive quarters; a missing
// quarter produces no value rather than a partial sum.
export function ttm(points: QuarterPoint[]): QuarterPoint[] {
	const s = sorted(points);
	const out: QuarterPoint[] = [];
	for (let i = 3; i < s.length; i++) {
		const window = s.slice(i - 3, i + 1);
		let consecutive = true;
		for (let j = 1; j < window.length; j++) {
			const prev = window[j - 1];
			const next = window[j];
			if (!prev || !next || !isNextQuarter(prev.periodEnd, next.periodEnd)) {
				consecutive = false;
				break;
			}
		}
		const last = s[i];
		if (!consecutive || !last) continue;
		out.push({
			periodEnd: last.periodEnd,
			value: window.reduce((acc, p) => acc + p.value, 0),
		});
	}
	return out;
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
export function capexToOcf(
	capex: QuarterPoint[],
	ocf: QuarterPoint[],
): QuarterPoint[] {
	return align([capex, ocf], ([c = 0, o = 0]) => (o > 0 ? c / o : undefined));
}

// Free cash flow after capex: OCF - capex (capex as a positive outflow).
export function fcfAfterCapex(
	ocf: QuarterPoint[],
	capex: QuarterPoint[],
): QuarterPoint[] {
	return align([ocf, capex], ([o = 0, c = 0]) => o - c);
}

// Cash interest coverage: (OCF + cash interest paid) / cash interest paid.
// OCF is after interest, so interest is added back. Skipped when interest
// paid <= 0.
export function interestCoverage(
	ocf: QuarterPoint[],
	interestPaid: QuarterPoint[],
): QuarterPoint[] {
	return align([ocf, interestPaid], ([o = 0, i = 0]) =>
		i > 0 ? (o + i) / i : undefined,
	);
}

// (Long-term debt + finance lease liabilities) / TTM operating cash flow.
// Takes quarterly OCF and computes TTM itself. Skipped when TTM OCF <= 0.
export function debtToOcf(
	debt: QuarterPoint[],
	financeLeases: QuarterPoint[],
	ocfQuarterly: QuarterPoint[],
): QuarterPoint[] {
	return align(
		[debt, financeLeases, ttm(ocfQuarterly)],
		([d = 0, l = 0, o = 0]) => (o > 0 ? (d + l) / o : undefined),
	);
}

function priorYearValue(s: QuarterPoint[], periodEnd: string) {
	for (let i = s.length - 1; i >= 0; i--) {
		const p = s[i];
		if (p && isPriorYear(p.periodEnd, periodEnd)) return p.value;
	}
	return undefined;
}

// TTM revenue / RPO one year earlier: how much of last year's contracted
// backlog the company actually turned into revenue. Skipped when the prior
// RPO is missing or <= 0.
export function rpoConversion(
	revenueQuarterly: QuarterPoint[],
	rpo: QuarterPoint[],
): QuarterPoint[] {
	const r = sorted(rpo);
	const out: QuarterPoint[] = [];
	for (const p of ttm(revenueQuarterly)) {
		const prior = priorYearValue(r, p.periodEnd);
		if (prior === undefined || prior <= 0) continue;
		out.push({ periodEnd: p.periodEnd, value: p.value / prior });
	}
	return out;
}

// Year-over-year growth as a fraction (0.25 = +25%). Skipped when the
// prior-year value is missing or <= 0, where growth is undefined.
export function growthYoY(points: QuarterPoint[]): QuarterPoint[] {
	const s = sorted(points);
	const out: QuarterPoint[] = [];
	for (const p of s) {
		const prior = priorYearValue(s, p.periodEnd);
		if (prior === undefined || prior <= 0) continue;
		out.push({ periodEnd: p.periodEnd, value: p.value / prior - 1 });
	}
	return out;
}

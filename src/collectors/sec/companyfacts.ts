import * as v from "valibot";
import type { ObservationKind } from "~/domain/types";
import { permanent } from "../errors";

// Shape of https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json.
// Only non-dimensional facts are published there, so every value is a
// company-wide total.
const FactSchema = v.object({
	start: v.optional(v.string()),
	end: v.string(),
	val: v.number(),
	accn: v.string(),
	form: v.string(),
	filed: v.string(),
});

const ConceptSchema = v.object({
	label: v.nullish(v.string()),
	units: v.record(v.string(), v.array(FactSchema)),
});

const CompanyFactsSchema = v.object({
	// Usually a number, but some responses send the zero-padded string.
	cik: v.union([v.number(), v.string()]),
	entityName: v.string(),
	facts: v.record(v.string(), v.record(v.string(), ConceptSchema)),
});

export type Fact = v.InferOutput<typeof FactSchema>;
export type CompanyFacts = v.InferOutput<typeof CompanyFactsSchema>;

export function parseCompanyFacts(json: string): CompanyFacts {
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch (err) {
		throw permanent("companyfacts response is not JSON", err);
	}
	const r = v.safeParse(CompanyFactsSchema, raw);
	if (!r.success) {
		throw permanent(
			`unexpected companyfacts shape: ${r.issues.map((i) => i.message).join(", ")}`,
		);
	}
	return r.output;
}

// Only periodic reports on US domestic forms. 8-K recasts and 20-F/40-F
// (annual-only foreign filers) are excluded so every series has the same
// filing basis.
const PERIODIC_FORMS = new Set([
	"10-K",
	"10-K/A",
	"10-KT",
	"10-KT/A",
	"10-Q",
	"10-Q/A",
]);

export function hasPeriodicFilings(cf: CompanyFacts) {
	for (const concept of Object.values(cf.facts["us-gaap"] ?? {})) {
		for (const f of concept.units.USD ?? []) {
			if (PERIODIC_FORMS.has(f.form)) return true;
		}
	}
	return false;
}

// Non-USD units (e.g. RUB in older Nebius filings) are ignored, never converted.
export function usdFacts(cf: CompanyFacts, tag: string): Fact[] {
	const concept = cf.facts["us-gaap"]?.[tag];
	return (concept?.units.USD ?? []).filter((f) => PERIODIC_FORMS.has(f.form));
}

export function tagLabel(cf: CompanyFacts, tag: string) {
	return cf.facts["us-gaap"]?.[tag]?.label ?? tag;
}

export type Point = {
	periodStart: string;
	periodEnd: string;
	value: number;
	kind: ObservationKind;
	asOf: string;
	// Accession number of the filing that provides (or completes) the value.
	accn: string;
	note?: string;
};

const DAY_MS = 86_400_000;

function toDay(iso: string) {
	return Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
}

function fromDay(day: number) {
	return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

// Inclusive day count: a calendar quarter is 90-92 days, a 13-week quarter 91.
function durationDays(start: string, end: string) {
	return toDay(end) - toDay(start) + 1;
}

export function isQuarterLength(days: number) {
	return days >= 80 && days <= 100;
}

function isYearLength(days: number) {
	return days >= 350 && days <= 380;
}

// The same period is repeated in later filings (comparatives, restatements).
// The most recently filed value wins.
function latestByKey(facts: Fact[], key: (f: Fact) => string) {
	const out = new Map<string, Fact>();
	for (const f of facts) {
		const k = key(f);
		const prev = out.get(k);
		if (!prev || f.filed >= prev.filed) out.set(k, f);
	}
	return out;
}

function newer(a: Fact, b: Fact) {
	return a.filed >= b.filed ? a : b;
}

// Turns a mix of quarterly, year-to-date and annual duration facts into
// discrete quarters. Direct ~3-month facts are "reported"; anything else is
// the difference of two cumulative facts with the same start date (6M - 3M,
// 9M - 6M, FY - 9M) or, failing that, FY minus the three preceding quarters.
export function quarterlyFlows(facts: Fact[]): Point[] {
	const durations = latestByKey(
		facts.filter((f) => f.start !== undefined),
		(f) => `${f.start}/${f.end}`,
	);
	const byStart = new Map<string, Fact[]>();
	for (const f of durations.values()) {
		const start = f.start as string;
		const list = byStart.get(start) ?? [];
		list.push(f);
		byStart.set(start, list);
	}

	const quarters = new Map<string, Point>();
	for (const f of durations.values()) {
		const start = f.start as string;
		if (!isQuarterLength(durationDays(start, f.end))) continue;
		const prev = quarters.get(f.end);
		// Two different ~3-month windows ending on the same day should not
		// happen; keep the most recently filed one.
		if (prev && prev.asOf > f.filed) continue;
		quarters.set(f.end, {
			periodStart: start,
			periodEnd: f.end,
			value: f.val,
			kind: "reported",
			asOf: f.filed,
			accn: f.accn,
		});
	}

	for (const group of byStart.values()) {
		group.sort((a, b) => a.end.localeCompare(b.end));
		for (const longer of group) {
			if (quarters.has(longer.end)) continue;
			for (const shorter of group) {
				if (shorter.end >= longer.end) break;
				const periodStart = fromDay(toDay(shorter.end) + 1);
				if (!isQuarterLength(durationDays(periodStart, longer.end))) continue;
				const source = newer(longer, shorter);
				quarters.set(longer.end, {
					periodStart,
					periodEnd: longer.end,
					value: longer.val - shorter.val,
					kind: "calculated",
					asOf: source.filed,
					accn: source.accn,
					note: `Derived: ${longer.start}..${longer.end} (${longer.form} ${longer.accn}) minus ${shorter.start}..${shorter.end} (${shorter.form} ${shorter.accn}).`,
				});
				break;
			}
		}
	}

	for (const fy of durations.values()) {
		const start = fy.start as string;
		if (quarters.has(fy.end) || !isYearLength(durationDays(start, fy.end))) {
			continue;
		}
		const chain: Point[] = [];
		let nextStart = start;
		for (let i = 0; i < 3; i++) {
			const q = [...quarters.values()].find((p) => p.periodStart === nextStart);
			if (!q) break;
			chain.push(q);
			nextStart = fromDay(toDay(q.periodEnd) + 1);
		}
		if (chain.length !== 3) continue;
		if (!isQuarterLength(durationDays(nextStart, fy.end))) continue;
		const sum = chain.reduce((acc, q) => acc + q.value, 0);
		const asOf = chain.reduce(
			(acc, q) => (q.asOf > acc ? q.asOf : acc),
			fy.filed,
		);
		quarters.set(fy.end, {
			periodStart: nextStart,
			periodEnd: fy.end,
			value: fy.val - sum,
			kind: "calculated",
			asOf,
			accn: fy.accn,
			note: `Derived: fiscal year ${start}..${fy.end} (${fy.form} ${fy.accn}) minus the three preceding quarters.`,
		});
	}

	return [...quarters.values()].sort((a, b) =>
		a.periodEnd.localeCompare(b.periodEnd),
	);
}

// Balance-sheet values. With several tags the value is their sum (e.g.
// non-current + current portion) and only dates where every tag is present
// are kept.
export function instants(factsPerTag: Fact[][], tags: string[]): Point[] {
	const maps = factsPerTag.map((facts) =>
		latestByKey(
			facts.filter((f) => f.start === undefined),
			(f) => f.end,
		),
	);
	const [first, ...rest] = maps;
	if (!first) return [];
	const out: Point[] = [];
	for (const [end, f] of first) {
		const parts = [f];
		for (const m of rest) {
			const p = m.get(end);
			if (p) parts.push(p);
		}
		if (parts.length !== maps.length) continue;
		const source = parts.reduce(newer);
		out.push({
			periodStart: end,
			periodEnd: end,
			value: parts.reduce((acc, p) => acc + p.val, 0),
			kind: parts.length > 1 ? "calculated" : "reported",
			asOf: source.filed,
			accn: source.accn,
			note:
				parts.length > 1
					? `Sum of ${tags.map((t, i) => `${t} (${parts[i]?.accn})`).join(" + ")}.`
					: undefined,
		});
	}
	return out.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
}

export function filingIndexUrl(cik: number, accn: string) {
	return `https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replaceAll("-", "")}/${accn}-index.htm`;
}

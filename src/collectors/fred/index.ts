import type { SeriesDef } from "~/domain/types";
import { classify, permanent } from "../errors";
import type { CollectOutput, Collector } from "../types";

type FredSeries = {
	id: string;
	label: string;
	unit: string;
	methodology: string;
	// ICE BofA indices are licensed to FRED for a rolling 3-year window only.
	ice: boolean;
};

const ICE_NOTE =
	"ICE BofA index via FRED. FRED only publishes a rolling 3-year window, so older history exists only if this monitor stored it.";

export const FRED_SERIES: FredSeries[] = [
	{
		id: "BAMLH0A0HYM2",
		label: "US High Yield OAS",
		unit: "%",
		methodology: `Option-adjusted spread of the ICE BofA US High Yield Index over Treasuries. ${ICE_NOTE}`,
		ice: true,
	},
	{
		id: "BAMLH0A1HYBB",
		label: "US BB OAS",
		unit: "%",
		methodology: `OAS of the BB-rated subset of the ICE BofA US High Yield Index. ${ICE_NOTE}`,
		ice: true,
	},
	{
		id: "BAMLH0A2HYB",
		label: "US B OAS",
		unit: "%",
		methodology: `OAS of the single-B subset of the ICE BofA US High Yield Index. ${ICE_NOTE}`,
		ice: true,
	},
	{
		id: "BAMLH0A3HYC",
		label: "US CCC & lower OAS",
		unit: "%",
		methodology: `OAS of the CCC-and-below subset of the ICE BofA US High Yield Index. ${ICE_NOTE}`,
		ice: true,
	},
	{
		id: "BAMLC0A4CBBB",
		label: "US BBB corporate OAS",
		unit: "%",
		methodology: `OAS of the BBB-rated subset of the ICE BofA US Corporate (investment grade) Index. ${ICE_NOTE}`,
		ice: true,
	},
	{
		id: "BAMLH0A0HYM2EY",
		label: "US High Yield effective yield",
		unit: "%",
		methodology: `Effective yield (not a spread) of the ICE BofA US High Yield Index. Moves with Treasury rates as well as credit risk. ${ICE_NOTE}`,
		ice: true,
	},
	{
		id: "BAA10Y",
		label: "Moody's Baa yield minus 10y Treasury",
		unit: "%",
		methodology:
			"Moody's seasoned Baa corporate bond yield minus the 10-year constant-maturity Treasury yield. Long-history investment-grade spread proxy; not option-adjusted.",
		ice: false,
	},
	{
		id: "DBAA",
		label: "Moody's Baa corporate yield",
		unit: "%",
		methodology:
			"Moody's seasoned Baa corporate bond yield. An absolute yield, not a spread.",
		ice: false,
	},
	{
		id: "DGS10",
		label: "10-year Treasury yield",
		unit: "%",
		methodology:
			"10-year US Treasury constant-maturity yield. Rate context for absolute yields.",
		ice: false,
	},
];

const BACKFILL_START = "2000-01-01";
// Routine runs re-read a window wide enough to pick up FRED revisions.
const ROUTINE_LOOKBACK_DAYS = 120;

export function fredSeriesId(id: string) {
	return `fred.${id}`;
}

export function seriesDef(s: FredSeries): SeriesDef {
	return {
		id: fredSeriesId(s.id),
		indicator: "credit",
		label: s.label,
		source: s.ice ? "FRED / ICE BofA" : "FRED",
		sourceUrl: `https://fred.stlouisfed.org/series/${s.id}`,
		unit: s.unit,
		methodology: s.methodology,
		cadence: "weekdays",
		collector: "fred",
	};
}

// FRED graph CSV: header "observation_date,<ID>", "." or blank for missing.
export function parseFredCsv(csv: string, id: string) {
	const lines = csv.replace(/^﻿/, "").trim().split(/\r?\n/);
	const header = lines[0]?.split(",") ?? [];
	if (header[1] !== id || !/date/i.test(header[0] ?? "")) {
		throw permanent(`unexpected FRED CSV header for ${id}: ${lines[0]}`);
	}
	const out: { date: string; value: number }[] = [];
	for (const line of lines.slice(1)) {
		const [date, raw] = line.split(",");
		if (!date || !raw || raw.trim() === "" || raw.trim() === ".") continue;
		const value = Number(raw);
		if (!Number.isFinite(value)) {
			throw permanent(`non-numeric FRED value for ${id} on ${date}: ${raw}`);
		}
		out.push({ date, value });
	}
	return out;
}

export const fredCollector: Collector = {
	name: "fred",
	description: "FRED credit spreads and yields (ICE BofA, Moody's, Treasury)",
	async collect({ backfill, now, fetch, log }) {
		const start = backfill
			? BACKFILL_START
			: new Date(now.getTime() - ROUTINE_LOOKBACK_DAYS * 86_400_000)
					.toISOString()
					.slice(0, 10);
		const out: Required<
			Pick<CollectOutput, "series" | "observations" | "failures">
		> = {
			series: [],
			observations: [],
			failures: [],
		};
		for (const s of FRED_SERIES) {
			try {
				const res = await fetch(
					`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s.id}&cosd=${start}`,
				);
				const rows = parseFredCsv(await res.text(), s.id);
				if (rows.length === 0) throw permanent(`no observations for ${s.id}`);
				out.series.push(seriesDef(s));
				for (const r of rows) {
					out.observations.push({
						seriesId: fredSeriesId(s.id),
						periodStart: r.date,
						periodEnd: r.date,
						value: r.value,
						kind: "reported",
					});
				}
				log(`${s.id}: ${rows.length} rows from ${rows[0]?.date}`);
			} catch (err) {
				out.failures.push({ key: s.id, error: classify(err) });
			}
		}
		if (out.series.length === 0) {
			throw out.failures[0]?.error ?? permanent("no FRED series collected");
		}
		return out;
	},
};

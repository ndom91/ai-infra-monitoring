import type { Cadence, IndicatorId, SeriesDef } from "~/domain/types";
import { classify, permanent } from "../errors";
import type { CollectOutput, Collector } from "../types";
import { isoDay } from "../util";

type FredSeries = {
  id: string;
  indicator: IndicatorId;
  cadence: Cadence;
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
    indicator: "credit",
    cadence: "weekdays",
    label: "US High Yield OAS",
    unit: "%",
    methodology: `Option-adjusted spread of the ICE BofA US High Yield Index over Treasuries. ${ICE_NOTE}`,
    ice: true,
  },
  {
    id: "BAMLH0A1HYBB",
    indicator: "credit",
    cadence: "weekdays",
    label: "US BB OAS",
    unit: "%",
    methodology: `OAS of the BB-rated subset of the ICE BofA US High Yield Index. ${ICE_NOTE}`,
    ice: true,
  },
  {
    id: "BAMLH0A2HYB",
    indicator: "credit",
    cadence: "weekdays",
    label: "US B OAS",
    unit: "%",
    methodology: `OAS of the single-B subset of the ICE BofA US High Yield Index. ${ICE_NOTE}`,
    ice: true,
  },
  {
    id: "BAMLH0A3HYC",
    indicator: "credit",
    cadence: "weekdays",
    label: "US CCC & lower OAS",
    unit: "%",
    methodology: `OAS of the CCC-and-below subset of the ICE BofA US High Yield Index. ${ICE_NOTE}`,
    ice: true,
  },
  {
    id: "BAMLC0A4CBBB",
    indicator: "credit",
    cadence: "weekdays",
    label: "US BBB corporate OAS",
    unit: "%",
    methodology: `OAS of the BBB-rated subset of the ICE BofA US Corporate (investment grade) Index. ${ICE_NOTE}`,
    ice: true,
  },
  {
    id: "BAMLH0A0HYM2EY",
    indicator: "credit",
    cadence: "weekdays",
    label: "US High Yield effective yield",
    unit: "%",
    methodology: `Effective yield (not a spread) of the ICE BofA US High Yield Index. Moves with Treasury rates as well as credit risk. ${ICE_NOTE}`,
    ice: true,
  },
  {
    id: "BAA10Y",
    indicator: "credit",
    cadence: "weekdays",
    label: "Moody's Baa yield minus 10y Treasury",
    unit: "%",
    methodology:
      "Moody's seasoned Baa corporate bond yield minus the 10-year constant-maturity Treasury yield. Long-history investment-grade spread proxy; not option-adjusted.",
    ice: false,
  },
  {
    id: "DBAA",
    indicator: "credit",
    cadence: "weekdays",
    label: "Moody's Baa corporate yield",
    unit: "%",
    methodology: "Moody's seasoned Baa corporate bond yield. An absolute yield, not a spread.",
    ice: false,
  },
  {
    id: "DGS10",
    indicator: "credit",
    cadence: "weekdays",
    label: "10-year Treasury yield",
    unit: "%",
    methodology: "10-year US Treasury constant-maturity yield. Rate context for absolute yields.",
    ice: false,
  },
  {
    id: "PCU518210518210",
    indicator: "gpu_rental",
    cadence: "monthly",
    label: "PPI: data processing, hosting and related services",
    unit: "index",
    methodology:
      "BLS Producer Price Index by industry for data processing, hosting and related services (NAICS 518210). Index, December 2000 = 100, not seasonally adjusted. Measures prices received by providers, not GPU rental rates specifically.",
    ice: false,
  },
  {
    id: "IPG3344S",
    indicator: "construction",
    cadence: "monthly",
    label: "Industrial production: semiconductors and other electronic components",
    unit: "index",
    methodology:
      "Federal Reserve industrial production index for semiconductor and other electronic component manufacturing (NAICS 3344). Index, 2017 = 100, seasonally adjusted. Measures output volume, not data center construction.",
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
    indicator: s.indicator,
    label: s.label,
    source: s.ice ? "FRED / ICE BofA" : "FRED",
    sourceUrl: `https://fred.stlouisfed.org/series/${s.id}`,
    unit: s.unit,
    methodology: s.methodology,
    cadence: s.cadence,
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
  description:
    "FRED credit spreads and yields (ICE BofA, Moody's, Treasury), hosting PPI and semiconductor production",
  async collect({ backfill, now, fetch, log }) {
    const start = backfill
      ? BACKFILL_START
      : isoDay(new Date(now.getTime() - ROUTINE_LOOKBACK_DAYS * 86_400_000));
    const out: Required<Pick<CollectOutput, "series" | "observations" | "failures">> = {
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
    return out;
  },
};

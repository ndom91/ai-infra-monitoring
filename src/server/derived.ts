import { SEC_COMPANIES } from "~/domain/companies";
import {
  capexToOcf,
  debtToOcf,
  fcfAfterCapex,
  growthYoY,
  interestCoverage,
  type QuarterPoint,
  rpoConversion,
  ttm,
} from "~/metrics/fundamentals";
import type { ObsPoint, SeriesDefView } from "./views";

type Derived = { def: SeriesDefView; points: ObsPoint[] };

const SEC_URL = "https://www.sec.gov/search-filings/edgar-application-programming-interfaces";

function toObs(points: QuarterPoint[], note: string): ObsPoint[] {
  return points.map((p) => ({
    id: 0,
    periodStart: p.periodEnd,
    periodEnd: p.periodEnd,
    value: p.value,
    kind: "calculated",
    asOf: null,
    sourceUrl: null,
    note,
  }));
}

// Derived metrics are computed at read time from raw SEC series and never
// stored, so a methodology change never leaves stale derived rows behind.
export function deriveCompanySeries(
  ticker: string,
  get: (concept: string) => QuarterPoint[],
): Derived[] {
  const capex = get("capex");
  const ocf = get("ocf");
  const revenue = get("revenue");
  const make = (
    id: string,
    label: string,
    unit: string,
    indicator: string,
    methodology: string,
    points: QuarterPoint[],
  ): Derived => ({
    def: {
      id: `derived.${ticker}.${id}`,
      indicator,
      label: `${ticker} ${label}`,
      entity: ticker,
      source: "Derived from SEC XBRL",
      sourceUrl: SEC_URL,
      unit,
      currency: unit === "USD" ? "USD" : null,
      methodology,
      cadence: "quarterly",
      collector: "sec",
    },
    points: toObs(points, methodology),
  });
  const pct = (ps: QuarterPoint[]) => ps.map((p) => ({ ...p, value: p.value * 100 }));

  return [
    make(
      "capex_ocf_ttm",
      "capex / OCF (TTM)",
      "×",
      "capex_cashflow",
      "Trailing-12-month capex divided by trailing-12-month operating cash flow. Above 1× means capex exceeds cash from operations. Omitted where TTM OCF ≤ 0 or a quarter is missing.",
      capexToOcf(ttm(capex), ttm(ocf)),
    ),
    make(
      "fcf_ttm",
      "FCF after capex (TTM)",
      "USD",
      "capex_cashflow",
      "Trailing-12-month operating cash flow minus trailing-12-month capex. Excludes finance-lease principal payments.",
      fcfAfterCapex(ttm(ocf), ttm(capex)),
    ),
    make(
      "interest_coverage_ttm",
      "cash interest coverage (TTM)",
      "×",
      "capex_cashflow",
      "(TTM OCF + TTM cash interest paid) / TTM cash interest paid. OCF is after interest, so interest is added back.",
      interestCoverage(ttm(ocf), ttm(get("interest_paid"))),
    ),
    make(
      "debt_to_ocf",
      "(debt + finance leases) / TTM OCF",
      "×",
      "capex_cashflow",
      "Long-term debt (incl. current portion) plus finance-lease liabilities, divided by TTM operating cash flow. Operating leases excluded. Omitted where TTM OCF ≤ 0.",
      debtToOcf(get("debt"), get("finance_leases"), ocf),
    ),
    make(
      "rpo_conversion",
      "TTM revenue / RPO a year earlier",
      "×",
      "contract_conversion",
      "Trailing-12-month revenue divided by remaining performance obligations reported about one year earlier. Falling values mean backlog is converting to revenue more slowly.",
      rpoConversion(revenue, get("rpo")),
    ),
    make(
      "revenue_ttm_yoy",
      "TTM revenue growth YoY",
      "%",
      "contract_conversion",
      "Year-over-year growth of trailing-12-month revenue.",
      pct(growthYoY(ttm(revenue))),
    ),
    make(
      "rpo_yoy",
      "RPO growth YoY",
      "%",
      "contract_conversion",
      "Year-over-year growth of remaining performance obligations.",
      pct(growthYoY(get("rpo"))),
    ),
    make(
      "ar_yoy",
      "receivables growth YoY",
      "%",
      "contract_conversion",
      "Year-over-year growth of net accounts receivable. Receivables growing faster than revenue can mean slower collection.",
      pct(growthYoY(get("ar"))),
    ),
  ].filter((d) => d.points.length > 0);
}

export const COMPANY_GROUPS = Object.fromEntries(SEC_COMPANIES.map((c) => [c.ticker, c.group]));
export const TICKERS = SEC_COMPANIES.map((c) => c.ticker);

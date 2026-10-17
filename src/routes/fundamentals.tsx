import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { CompanyPicker } from "~/components/CompanyPicker";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { SectionHeader } from "~/components/SectionHeader";
import { SEC_COMPANIES } from "~/domain/companies";
import { indicatorById, SECTIONS } from "~/domain/indicators";
import { parseRange } from "~/domain/ranges";
import { getFundamentalsData, type SeriesView } from "~/server/data";

const TICKERS = SEC_COMPANIES.map((c) => c.ticker);

export const Route = createFileRoute("/fundamentals")({
  validateSearch: (s) => ({
    range: parseRange(s.range, "5y"),
    company: TICKERS.includes(String(s.company)) ? String(s.company) : "CRWV",
  }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) => getFundamentalsData({ data: { range: deps.range } }),
  component: FundamentalsPage,
});

function FundamentalsPage() {
  const { series } = Route.useLoaderData();
  const { range, company } = Route.useSearch();
  const section = SECTIONS.find((s) => s.id === "fundamentals");
  const byId = new Map(series.map((s) => [s.id, s]));
  const pick = (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  const sec = (concepts: string[]) => pick(concepts.map((c) => `sec.${company}.${c}`));
  const derived = (ids: string[]) => pick(ids.map((d) => `derived.${company}.${d}`));
  const acrossGroup = (group: string, metric: string) =>
    pick(
      SEC_COMPANIES.filter((c) => c.group === group).map((c) => `derived.${c.ticker}.${metric}`),
    );
  const tickerLabel = (s: SeriesView) => s.entity ?? s.label;
  const manual = (indicator: string) =>
    series.filter((s) => s.indicator === indicator && s.collector === "manual");

  return (
    <>
      <SectionHeader
        title={section?.label ?? "Fundamentals"}
        blurb={section?.blurb ?? ""}
        range={range}
      />
      <CompanyPicker active={company} />

      <IndicatorPanel def={indicatorById("capex_cashflow")}>
        <div className="grid-2">
          <ChartBlock
            title="Capex intensity: hyperscalers"
            subtitle="TTM capex / TTM operating cash flow"
            series={acrossGroup("hyperscaler", "capex_ocf_ttm")}
            labelOf={tickerLabel}
          />
          <ChartBlock
            title="Capex intensity: neoclouds"
            subtitle="TTM capex / TTM operating cash flow. Missing where OCF ≤ 0"
            series={acrossGroup("neocloud", "capex_ocf_ttm")}
            labelOf={tickerLabel}
          />
          <ChartBlock
            title={`${company}: capex vs operating cash flow`}
            subtitle="Quarterly, as filed or derived from year-to-date figures"
            series={sec(["capex", "ocf"])}
          />
          <ChartBlock
            title={`${company}: free cash flow after capex`}
            subtitle="TTM operating cash flow minus TTM capex"
            series={derived(["fcf_ttm"])}
          />
          <ChartBlock
            title={`${company}: debt and lease obligations`}
            subtitle="Balance-sheet values at quarter end"
            series={sec(["debt", "finance_leases", "operating_leases", "cash"])}
          />
          <ChartBlock
            title={`${company}: leverage and coverage`}
            subtitle="Derived ratios; lines with different meanings share one axis only as indices"
            series={derived(["debt_to_ocf", "interest_coverage_ttm"])}
          />
          <ChartBlock
            title={`${company}: interest`}
            subtitle="Income-statement expense vs cash actually paid"
            series={sec(["interest_expense", "interest_paid"])}
          />
          <ChartBlock
            title="Leverage: neoclouds"
            subtitle="(Debt + finance leases) / TTM operating cash flow"
            series={acrossGroup("neocloud", "debt_to_ocf")}
            labelOf={tickerLabel}
          />
        </div>
      </IndicatorPanel>

      <IndicatorPanel def={indicatorById("contract_conversion")}>
        <div className="grid-2">
          <ChartBlock
            title={`${company}: backlog vs revenue`}
            subtitle="RPO (balance at quarter end) and quarterly revenue"
            series={sec(["rpo", "revenue", "ar"])}
          />
          <ChartBlock
            title={`${company}: conversion`}
            subtitle="TTM revenue / RPO reported a year earlier"
            series={derived(["rpo_conversion"])}
          />
          <ChartBlock
            title={`${company}: growth, year over year`}
            subtitle="Backlog rising faster than revenue and receivables is the pattern to watch"
            series={derived(["rpo_yoy", "revenue_ttm_yoy", "ar_yoy"])}
          />
          <ChartBlock
            title="Conversion across companies"
            subtitle="TTM revenue / RPO a year earlier"
            series={TICKERS.flatMap((t) => byId.get(`derived.${t}.rpo_conversion`) ?? [])}
            labelOf={tickerLabel}
          />
        </div>
      </IndicatorPanel>

      <IndicatorPanel def={indicatorById("customer_concentration")}>
        <ChartBlock
          title="Largest customer share of revenue"
          subtitle="As disclosed in filings; cited manual entries"
          series={manual("customer_concentration")}
          emptyReason="Concentration is disclosed in filing text, not XBRL. Cited entries are added manually."
        />
      </IndicatorPanel>

      <IndicatorPanel def={indicatorById("depreciation")}>
        <div className="grid-2">
          <ChartBlock
            title="Server useful-life assumptions"
            subtitle="Stepped: each point is an effective date of a change"
            series={manual("depreciation")}
            stepped
            labelOf={tickerLabel}
            emptyReason="Useful-life changes are added manually from 10-K/10-Q notes, with citations."
          />
          <ChartBlock
            title={`${company}: depreciation & amortization`}
            subtitle="Quarterly expense"
            series={sec(["da"])}
          />
        </div>
      </IndicatorPanel>
    </>
  );
}

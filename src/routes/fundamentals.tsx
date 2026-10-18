import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { CompanyPicker } from "~/components/CompanyPicker";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { SectionHeader } from "~/components/SectionHeader";
import { TermsTable } from "~/components/TermsTable";
import { SEC_COMPANIES } from "~/domain/companies";
import { EXPLAINERS } from "~/domain/explainers";
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

// "customer_concentration.CRWV.top2_pct_fy" -> "CRWV top2"
const concentrationLabel = (s: SeriesView) => {
  const [, ticker = "", metric = ""] = s.id.split(".");
  return `${ticker} ${metric.replace(/_pct_(fy|q)$/, "").replaceAll("_", " ")}`;
};

function FundamentalsPage() {
  const { series } = Route.useLoaderData();
  const { range, company } = Route.useSearch();
  const section = SECTIONS.find((s) => s.id === "fundamentals");
  const selected = SEC_COMPANIES.find((c) => c.ticker === company);
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
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Peer comparison</h2>
            <p className="measures">
              All tracked companies side by side. These charts do not change with the company
              selected below.
            </p>
          </div>
        </header>
        <div className="grid-2">
          <ChartBlock
            title="Capex intensity: hyperscalers"
            info={EXPLAINERS.capexIntensityHyper}
            subtitle="TTM capex / TTM operating cash flow"
            series={acrossGroup("hyperscaler", "capex_ocf_ttm")}
            labelOf={tickerLabel}
          />
          <ChartBlock
            title="Capex intensity: neoclouds"
            info={EXPLAINERS.capexIntensityNeo}
            subtitle="TTM capex / TTM operating cash flow. Missing where OCF ≤ 0"
            series={acrossGroup("neocloud", "capex_ocf_ttm")}
            labelOf={tickerLabel}
          />
          <ChartBlock
            title="Leverage: neoclouds"
            info={EXPLAINERS.leverageNeo}
            subtitle="(Debt + finance leases) / TTM operating cash flow"
            series={acrossGroup("neocloud", "debt_to_ocf")}
            labelOf={tickerLabel}
          />
          <ChartBlock
            title="Conversion across companies"
            info={EXPLAINERS.conversionPeers}
            subtitle="TTM revenue / RPO a year earlier"
            series={TICKERS.flatMap((t) => byId.get(`derived.${t}.rpo_conversion`) ?? [])}
            labelOf={tickerLabel}
          />
        </div>
      </section>

      <div className="section-head company-head">
        <div>
          <div className="eyebrow">Company detail</div>
          <h1>
            {selected?.name ?? company} <span className="ticker">{company}</span>
          </h1>
          <p>
            {selected?.group === "hyperscaler"
              ? "Hyperscaler: funds capex mostly from operating cash flow."
              : "Neocloud: funds capex largely with debt and leases."}{" "}
            Everything below follows the selected company.
          </p>
        </div>
      </div>
      <CompanyPicker active={company} />

      <IndicatorPanel def={indicatorById("capex_cashflow")}>
        <div className="grid-2">
          <ChartBlock
            title={`${company}: capex vs operating cash flow`}
            info={EXPLAINERS.capexVsOcf}
            subtitle="Quarterly, as filed or derived from year-to-date figures"
            series={sec(["capex", "ocf"])}
          />
          <ChartBlock
            title={`${company}: free cash flow after capex`}
            info={EXPLAINERS.fcf}
            subtitle="TTM operating cash flow minus TTM capex"
            series={derived(["fcf_ttm"])}
          />
          <ChartBlock
            title={`${company}: debt and lease obligations`}
            info={EXPLAINERS.debtLeases}
            subtitle="Balance-sheet values at quarter end"
            series={sec(["debt", "finance_leases", "operating_leases", "cash"])}
          />
          <ChartBlock
            title={`${company}: leverage and coverage`}
            info={EXPLAINERS.leverageCoverage}
            subtitle="Derived ratios; lines with different meanings share one axis only as indices"
            series={derived(["debt_to_ocf", "interest_coverage_ttm"])}
          />
          <ChartBlock
            title={`${company}: interest`}
            info={EXPLAINERS.interest}
            subtitle="Income-statement expense vs cash actually paid"
            series={sec(["interest_expense", "interest_paid"])}
          />
        </div>
      </IndicatorPanel>

      <IndicatorPanel def={indicatorById("contract_conversion")}>
        <div className="grid-2">
          <ChartBlock
            title={`${company}: backlog vs revenue`}
            info={EXPLAINERS.backlog}
            subtitle="RPO (balance at quarter end) and quarterly revenue"
            series={sec(["rpo", "revenue", "ar"])}
          />
          <ChartBlock
            title={`${company}: conversion`}
            info={EXPLAINERS.conversion}
            subtitle="TTM revenue / RPO reported a year earlier"
            series={derived(["rpo_conversion"])}
          />
          <ChartBlock
            title={`${company}: growth, year over year`}
            info={EXPLAINERS.growth}
            subtitle="Backlog rising faster than revenue and receivables is the pattern to watch"
            series={derived(["rpo_yoy", "revenue_ttm_yoy", "ar_yoy"])}
          />
        </div>
      </IndicatorPanel>

      <IndicatorPanel def={indicatorById("customer_concentration")}>
        <div className="grid-2">
          <ChartBlock
            title="Revenue share, full fiscal year"
            info={EXPLAINERS.concentrationFy}
            subtitle="Disclosed share of revenue from named or largest customers"
            series={manual("customer_concentration").filter((s) => s.id.endsWith("_pct_fy"))}
            labelOf={concentrationLabel}
          />
          <ChartBlock
            title="Revenue share, single quarter"
            info={EXPLAINERS.concentrationQ}
            subtitle="Quarter-only disclosures; never mixed with year-to-date shares"
            series={manual("customer_concentration").filter((s) => s.id.endsWith("_pct_q"))}
            labelOf={concentrationLabel}
          />
        </div>
        <TermsTable
          title="Announced customer contracts"
          info={EXPLAINERS.contracts}
          subtitle="Total contract values as announced. Not RPO, not guaranteed revenue."
          series={manual("customer_concentration").filter((s) => s.id.includes("contract_value"))}
        />
      </IndicatorPanel>

      <IndicatorPanel def={indicatorById("depreciation")}>
        <div className="grid-2">
          <ChartBlock
            title="Server useful-life assumptions"
            info={EXPLAINERS.usefulLife}
            subtitle="Stepped: each point is an effective date of a change"
            series={manual("depreciation")}
            stepped
            labelOf={tickerLabel}
            emptyReason="Useful-life changes are added manually from 10-K/10-Q notes, with citations."
          />
          <ChartBlock
            title={`${company}: depreciation & amortization`}
            info={EXPLAINERS.da}
            subtitle="Quarterly expense"
            series={sec(["da"])}
          />
        </div>
      </IndicatorPanel>
    </>
  );
}

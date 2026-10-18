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
              Every company side by side. These charts don't change when you pick a company below.
            </p>
          </div>
        </header>
        <div className="grid-2">
          <ChartBlock
            title="Big tech: spending vs cash coming in"
            info={EXPLAINERS.capexIntensityHyper}
            subtitle="12-month capital spending ÷ 12-month operating cash flow"
            series={acrossGroup("hyperscaler", "capex_ocf_ttm")}
            labelOf={tickerLabel}
          />
          <ChartBlock
            title="Neoclouds: spending vs cash coming in"
            info={EXPLAINERS.capexIntensityNeo}
            subtitle="12-month capex ÷ 12-month operating cash flow. Blank where cash flow was negative"
            series={acrossGroup("neocloud", "capex_ocf_ttm")}
            labelOf={tickerLabel}
          />
          <ChartBlock
            title="Neoclouds: debt vs cash coming in"
            info={EXPLAINERS.leverageNeo}
            subtitle="(Debt + finance leases) ÷ 12-month operating cash flow"
            series={acrossGroup("neocloud", "debt_to_ocf")}
            labelOf={tickerLabel}
          />
          <ChartBlock
            title="How fast the order book turns into revenue"
            info={EXPLAINERS.conversionPeers}
            subtitle="12-month revenue ÷ order book (RPO) a year earlier"
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
              ? "Hyperscaler: pays for most of its capex from its own cash."
              : "Neocloud: pays for most of its capex with debt and leases."}{" "}
            Everything below is for this company.
          </p>
        </div>
      </div>
      <CompanyPicker active={company} />

      <IndicatorPanel def={indicatorById("capex_cashflow")}>
        <div className="grid-2">
          <ChartBlock
            title={`${company}: capex vs cash from the business`}
            info={EXPLAINERS.capexVsOcf}
            subtitle="Quarterly. Some quarters are worked out from year-to-date totals"
            series={sec(["capex", "ocf"])}
          />
          <ChartBlock
            title={`${company}: free cash flow`}
            info={EXPLAINERS.fcf}
            subtitle="Last 12 months: operating cash flow minus capex"
            series={derived(["fcf_ttm"])}
          />
          <ChartBlock
            title={`${company}: debt and leases`}
            info={EXPLAINERS.debtLeases}
            subtitle="What it owes at each quarter end"
            series={sec(["debt", "finance_leases", "operating_leases", "cash"])}
          />
          <ChartBlock
            title={`${company}: can it carry its debt?`}
            info={EXPLAINERS.leverageCoverage}
            subtitle="Calculated ratios. Each line means something different, so compare it with its own history"
            series={derived(["debt_to_ocf", "interest_coverage_ttm"])}
          />
          <ChartBlock
            title={`${company}: interest costs`}
            info={EXPLAINERS.interest}
            subtitle="Interest on the books vs interest actually paid"
            series={sec(["interest_expense", "interest_paid"])}
          />
        </div>
      </IndicatorPanel>

      <IndicatorPanel def={indicatorById("contract_conversion")}>
        <div className="grid-2">
          <ChartBlock
            title={`${company}: order book vs revenue`}
            info={EXPLAINERS.backlog}
            subtitle="Order book (RPO) at quarter end, and quarterly revenue"
            series={sec(["rpo", "revenue", "ar"])}
          />
          <ChartBlock
            title={`${company}: order book to revenue`}
            info={EXPLAINERS.conversion}
            subtitle="12-month revenue ÷ order book a year earlier"
            series={derived(["rpo_conversion"])}
          />
          <ChartBlock
            title={`${company}: growth vs a year ago`}
            info={EXPLAINERS.growth}
            subtitle="Watch for the order book growing much faster than revenue"
            series={derived(["rpo_yoy", "revenue_ttm_yoy", "ar_yoy"])}
          />
        </div>
      </IndicatorPanel>

      <IndicatorPanel def={indicatorById("customer_concentration")}>
        <div className="grid-2">
          <ChartBlock
            title="Biggest customers' share of revenue, full year"
            info={EXPLAINERS.concentrationFy}
            subtitle="As disclosed in company filings"
            series={manual("customer_concentration").filter((s) => s.id.endsWith("_pct_fy"))}
            labelOf={concentrationLabel}
          />
          <ChartBlock
            title="Biggest customers' share of revenue, one quarter"
            info={EXPLAINERS.concentrationQ}
            subtitle="Single-quarter disclosures, kept apart from full-year ones"
            series={manual("customer_concentration").filter((s) => s.id.endsWith("_pct_q"))}
            labelOf={concentrationLabel}
          />
        </div>
        <TermsTable
          title="Announced customer contracts"
          info={EXPLAINERS.contracts}
          subtitle="Total value as announced. Not guaranteed revenue."
          series={manual("customer_concentration").filter((s) => s.id.includes("contract_value"))}
        />
      </IndicatorPanel>

      <IndicatorPanel def={indicatorById("depreciation")}>
        <div className="grid-2">
          <ChartBlock
            title="How long servers are assumed to last"
            info={EXPLAINERS.usefulLife}
            subtitle="Each step is a change the company announced"
            series={manual("depreciation")}
            stepped
            labelOf={tickerLabel}
            emptyReason="Changes are added by hand from company filings, with citations."
          />
          <ChartBlock
            title={`${company}: depreciation & amortization`}
            info={EXPLAINERS.da}
            subtitle="Quarterly cost of equipment wearing out"
            series={sec(["da"])}
          />
        </div>
      </IndicatorPanel>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { CompanyPicker } from "~/components/CompanyPicker";
import { FilingEvents } from "~/components/FilingEvents";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { PageLead } from "~/components/PageLead";
import { SectionHeader } from "~/components/SectionHeader";
import { TermsTable } from "~/components/TermsTable";
import { type CompanyGroup, SEC_COMPANIES } from "~/domain/companies";
import { EXPLAINERS } from "~/domain/explainers";
import { indicatorById, SECTIONS } from "~/domain/indicators";
import { parseRange } from "~/domain/ranges";
import { pageHead } from "~/lib/seo";
import { getFundamentalsData, type SeriesView } from "~/server/data";

const TICKERS = SEC_COMPANIES.map((c) => c.ticker);
const GROUP_BLURBS: Record<CompanyGroup, string> = {
  hyperscaler: "Hyperscaler: pays for most of its capex from its own cash.",
  neocloud: "Neocloud: pays for most of its capex with debt and leases.",
  supplier: "Hardware supplier: sells the chips and servers. Watch receivables and inventory.",
  dc_reit: "Datacenter REIT: owns and leases the buildings, funded mostly with debt and equity.",
  ai_lab: "AI lab that develops and sells access to models.",
};
// The order-book peer chart predates the supplier and REIT groups and stays
// limited to the companies that disclose comparable backlogs.
const BACKLOG_PEERS = SEC_COMPANIES.filter(
  (c) => c.group === "hyperscaler" || c.group === "neocloud",
).map((c) => c.ticker);

export const Route = createFileRoute("/fundamentals")({
  head: () =>
    pageHead(
      "/fundamentals",
      "Company Fundamentals",
      "Compare AI infrastructure companies' spending, cash flow, debt, and customer concentration.",
    ),
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
  const { series, filingEvents } = Route.useLoaderData();
  const { range, company } = Route.useSearch();
  const section = SECTIONS.find((s) => s.id === "fundamentals");
  const selected = SEC_COMPANIES.find((c) => c.ticker === company);
  const awaitingFundamentals =
    selected?.allowMissingPeriodicFilings &&
    !series.some((s) => s.collector === "sec" && s.entity === company);
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
      <PageLead title="Compare the funding behind the build-out">
        Start with the peer charts: they show which companies are spending against internally
        generated cash and which carry more debt. Then choose a company for its reported financial
        detail. Latest filings cover every tracked issuer and do not change with the selector.
      </PageLead>
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Peer comparison</h2>
            <p className="measures">
              These charts compare peers with available data and stay the same when you pick a
              company.
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
            series={BACKLOG_PEERS.flatMap((t) => byId.get(`derived.${t}.rpo_conversion`) ?? [])}
            labelOf={tickerLabel}
          />
          <ChartBlock
            title="Suppliers: how long customers take to pay"
            info={EXPLAINERS.dsoPeers}
            subtitle="Days sales outstanding: receivables ÷ quarterly revenue × 91. Calculated"
            series={acrossGroup("supplier", "dso")}
            labelOf={tickerLabel}
          />
          <ChartBlock
            title="Suppliers: how long stock sits unsold"
            info={EXPLAINERS.inventoryDays}
            subtitle="Inventory days: inventory ÷ quarterly cost of revenue × 91. Calculated"
            series={acrossGroup("supplier", "inventory_days")}
            labelOf={tickerLabel}
          />
        </div>
      </section>
      <FilingEvents events={filingEvents.slice(0, 12)} />

      <div className="section-head company-head">
        <div>
          <div className="eyebrow">Company detail</div>
          <h1>
            {selected?.name ?? company} <span className="ticker">{company}</span>
          </h1>
          <p>
            {selected ? GROUP_BLURBS[selected.group] : ""} Everything below is for this company.
          </p>
        </div>
      </div>
      <CompanyPicker active={company} />
      {awaitingFundamentals ? (
        <p className="measures">
          Quarterly figures appear here once we collect XBRL data from a 10-K or 10-Q.{" "}
          <a href={`https://www.sec.gov/edgar/browse/?CIK=${selected.cik}`}>
            Browse {selected.name}'s SEC filings
          </a>
        </p>
      ) : null}

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
          <ChartBlock
            title={`${company}: purchase commitments`}
            info={EXPLAINERS.purchaseObligations}
            subtitle="Unconditional purchase obligations from the filing notes. Missing for most companies"
            series={sec(["purchase_obligations"])}
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
          <ChartBlock
            title={`${company}: collection and stock days`}
            info={EXPLAINERS.dsoInventory}
            subtitle="Calculated: receivables and inventory in days of quarterly revenue and cost of revenue"
            series={derived(["dso", "inventory_days"])}
          />
          <ChartBlock
            title={`${company}: inventory`}
            info={EXPLAINERS.inventoryBalance}
            subtitle="Net inventory and quarterly cost of revenue"
            series={sec(["inventory", "cogs"])}
          />
        </div>
      </IndicatorPanel>

      <IndicatorPanel def={indicatorById("insider_activity")}>
        <div className="grid-2">
          <ChartBlock
            title={`${company}: insider open-market sales`}
            info={EXPLAINERS.insiderSales}
            subtitle="Calculated monthly: shares x price on Form 4 sales. The second line is sales under 10b5-1 plans"
            series={pick([
              `insider.${company}.open_market_sales_usd`,
              `insider.${company}.open_market_sales_10b5_1_usd`,
            ])}
            emptyReason="No priced open-market sales found for this company yet."
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

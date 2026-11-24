import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Chapter,
  ChapterCharts,
  type ChapterDef,
  ChapterHeader,
  ChapterLayout,
  ChapterMore,
} from "~/components/Chapters";
import { ChartBlock } from "~/components/ChartBlock";
import { EntityBand, EntityPicker } from "~/components/EntityPicker";
import { FilingEvents } from "~/components/FilingEvents";
import { IndicatorNotes } from "~/components/IndicatorNotes";
import { PageIntro } from "~/components/PageIntro";
import { freshnessNote, type Stat } from "~/components/StatList";
import { TermsTable } from "~/components/TermsTable";
import { cashSignal } from "~/domain/chapterSignals";
import { GROUP_BLURBS, SEC_COMPANIES, SEC_DEBT_COMPANIES } from "~/domain/companies";
import { EXPLAINERS } from "~/domain/explainers";
import {
  groupMedianAtLatestQuarter,
  insiderWindow,
  largestCustomerSeries,
} from "~/domain/headlines";
import { indicatorById } from "~/domain/indicators";
import { PAGE_PARAMS } from "~/domain/page-params";
import { parseRange } from "~/domain/ranges";
import { formatMonthYear, formatPeriod, formatValue } from "~/lib/format";
import { pageHead } from "~/lib/seo";
import { getCompanySeries, getFundamentalsData, type SeriesView } from "~/server/data";

const TICKERS = SEC_COMPANIES.map((c) => c.ticker);
// The order-book peer chart predates the supplier and REIT groups and stays
// limited to the companies that disclose comparable backlogs.
const BACKLOG_PEERS = SEC_COMPANIES.filter(
  (c) => c.group === "hyperscaler" || c.group === "neocloud",
).map((c) => c.ticker);
const HYPERSCALERS = SEC_COMPANIES.filter((c) => c.group === "hyperscaler").map((c) => c.ticker);

export const Route = createFileRoute("/fundamentals")({
  head: () =>
    pageHead(
      "/fundamentals",
      "Company Fundamentals",
      "Compare AI infrastructure companies' spending, cash flow, debt, and customer concentration.",
    ),
  validateSearch: (s) => ({
    range: parseRange(s.range, PAGE_PARAMS["/fundamentals"].range.default),
    company: TICKERS.includes(String(s.company))
      ? String(s.company)
      : PAGE_PARAMS["/fundamentals"].company.default,
  }),
  loaderDeps: ({ search }) => ({ range: search.range, company: search.company }),
  // Peer charts (shared) and the picked company's raw series load separately,
  // so the shared payload does not carry every company's raw filings.
  loader: async ({ deps }) => {
    const [shared, companySeries] = await Promise.all([
      getFundamentalsData({ data: { range: deps.range } }),
      getCompanySeries({ data: deps }),
    ]);
    return { ...shared, series: [...shared.series, ...companySeries] };
  },
  component: FundamentalsPage,
});

// "customer_concentration.CRWV.largest_customer_pct_fy" -> "largest customer"
const concentrationLabel = (s: SeriesView) => {
  const metric = s.id.split(".")[2] ?? "";
  const words = metric.replace(/_pct_(fy|q)$/, "").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const LIFE_SERIES = /\.(server|hpc_hardware)_useful_life$/;

// Latest value with its period; `null` value when nothing is stored.
function latestStat(
  label: string,
  s: SeriesView | undefined,
  note: string,
  opts: {
    tone?: Stat["tone"];
    missing?: string;
    placeholder?: string;
    format?: (v: number) => string;
  } = {},
): Stat {
  if (!s?.latest) {
    return {
      label,
      value: null,
      note: opts.missing ?? "Not reported",
      placeholder: opts.placeholder,
    };
  }
  const format = opts.format ?? ((v: number) => formatValue(v, s.unit));
  return {
    label,
    value: format(s.latest.value),
    note: `${formatPeriod(s.latest.periodEnd, s.cadence)} · ${note}${freshnessNote(s)}`,
    tone: opts.tone,
  };
}

function insiderSalesValue(collected: boolean, w: { total: number; months: number }) {
  if (!collected) return null;
  return w.months ? formatValue(w.total, "USD") : "None found";
}

const pct0 = (v: number) => `${Math.round(v)}%`;
const years = (v: number) => `${+v.toFixed(1)} yrs`;

function FundamentalsPage() {
  const { series, filingEvents, now } = Route.useLoaderData();
  const { range, company } = Route.useSearch();
  const selected = SEC_COMPANIES.find((c) => c.ticker === company);
  const name = selected?.name ?? company;
  const awaitingFundamentals =
    selected?.allowMissingPeriodicFilings &&
    !series.some((s) => s.collector === "sec" && s.entity === company);
  const byId = new Map(series.map((s) => [s.id, s]));
  const pick = (ids: string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  const sec = (concepts: string[]) => pick(concepts.map((c) => `sec.${company}.${c}`));
  const derived = (ids: string[]) => pick(ids.map((d) => `derived.${company}.${d}`));
  const one = (id: string) => byId.get(id);
  const acrossGroup = (group: string, metric: string) =>
    pick(
      SEC_COMPANIES.filter((c) => c.group === group).map((c) => `derived.${c.ticker}.${metric}`),
    );
  const tickerLabel = (s: SeriesView) => s.entity ?? s.label;
  const manual = (indicator: string) =>
    series.filter((s) => s.indicator === indicator && s.collector === "manual");
  const own = (list: SeriesView[]) => list.filter((s) => s.id.split(".")[1] === company);

  // ---- Headline figures ----
  const capexOcf = one(`derived.${company}.capex_ocf_ttm`);
  const groupMedian = (group: string): Stat | null => {
    const m = groupMedianAtLatestQuarter(acrossGroup(group, "capex_ocf_ttm").map((s) => s.points));
    if (!m) return null;
    return {
      label: `${group === "hyperscaler" ? "Hyperscalers" : "Neoclouds"}, capex ÷ cash flow`,
      value: formatValue(m.value, "×"),
      note: `Median of ${m.n} · ${formatPeriod(m.quarter, "quarterly")} · 12 months · calculated`,
    };
  };

  const concentration = own(manual("customer_concentration"));
  // Customer data is hand-curated for a few companies only. "Not tracked"
  // makes clear the gap is coverage, not a missing disclosure.
  const concentrationTracked = concentration.length > 0;
  const concentrationEmpty = concentrationTracked
    ? "No share disclosures for this period length are entered for this company."
    : `Customer shares are not tracked for ${company}. They are entered by hand from filings, with a quote for each.`;
  const concentrationMissing = concentrationTracked
    ? {
        format: pct0,
        placeholder: "None entered",
        missing: "No disclosure entered for this period",
      }
    : {
        format: pct0,
        placeholder: "Not tracked",
        missing: `No customer data entered for ${company}`,
      };
  const largestCustomerStat = (period: "fy" | "q") => {
    const found = largestCustomerSeries(concentration, period);
    const who = found?.customer
      ? `Largest disclosed customer (${found.customer})`
      : "Largest customer";
    return latestStat(
      `${who}, ${period === "fy" ? "full year" : "latest quarter"}`,
      found?.series,
      period === "fy" ? "share of revenue" : "single quarter",
      concentrationMissing,
    );
  };
  const insiderTotal = one(`insider.${company}.open_market_sales_usd`);
  const insiderPlanned = one(`insider.${company}.open_market_sales_10b5_1_usd`);
  const endMonth = now.slice(0, 7);
  const insider = insiderWindow(insiderTotal?.points ?? [], insiderPlanned?.points ?? [], endMonth);
  const windowNote = `3 months to ${formatMonthYear(endMonth)} · calculated`;

  const lives = manual("depreciation").filter((s) => LIFE_SERIES.test(s.id));
  const ownLife = lives.find((s) => s.id.split(".")[1] === company);
  const ownLifePrior = ownLife?.points.at(-2);
  const hyperLives = lives.filter((s) => HYPERSCALERS.includes(s.id.split(".")[1] ?? ""));
  const hyperLatest = hyperLives.flatMap((s) => (s.latest ? [s.latest.value] : []));
  const maxLife = hyperLatest.length ? Math.max(...hyperLatest) : null;

  const peers: ChapterDef = {
    slug: "peers",
    label: "Across peers",
    sub: "Same for every company",
    signal: "context",
  };
  const cash: ChapterDef = {
    slug: "cash",
    label: "Cash & spending",
    sub: `${company} · quarterly`,
    signal: cashSignal(capexOcf?.latest?.value),
  };
  const orders: ChapterDef = {
    slug: "orders",
    label: "Order book",
    sub: `${company} · quarterly`,
    signal: "context",
  };
  const customers: ChapterDef = {
    slug: "customers",
    label: "Customers",
    sub: `${company} · from filings`,
    signal: "context",
  };
  const insiders: ChapterDef = {
    slug: "insiders",
    label: "Insider sales",
    sub: `${company} · monthly`,
    signal: "context",
  };
  const depreciation: ChapterDef = {
    slug: "depreciation",
    label: "Depreciation",
    sub: "All companies",
    signal: "context",
  };
  const chapters = [peers, cash, orders, customers, insiders, depreciation];
  const total = chapters.length;
  const cashTone = cash.signal === "context" ? undefined : cash.signal;

  const picker = (variant: "rail" | "row") => (
    <EntityPicker companies={SEC_COMPANIES} active={company} variant={variant} label="Company" />
  );
  const hasDebtPage = SEC_DEBT_COMPANIES.some((c) => c.ticker === company);

  return (
    <>
      <PageIntro
        eyebrow="Fundamentals"
        title="Who is paying for the build-out, and with what?"
        range={range}
      >
        Six chapters. The first compares peers inside each group; the rest follow one company. Each
        opens with the question it answers and shows the two charts that answer it. Everything else
        is one click away.
      </PageIntro>
      <ChapterLayout
        chapters={chapters}
        picker={{ heading: "Company · chapters 02–06", node: picker("rail") }}
      >
        <Chapter chapter={peers}>
          <ChapterHeader
            index={1}
            total={total}
            chapter={peers}
            meta="Same for every company"
            question="Who is spending beyond the cash their business brings in?"
            watchFor="neoclouds whose capex runs well above operating cash flow while their debt keeps rising."
            stats={[
              latestStat(
                `${name}, capex ÷ operating cash flow`,
                capexOcf,
                "12 months · calculated",
                {
                  tone: cashTone,
                  missing: "Not calculated: needs positive 12-month operating cash flow",
                },
              ),
              ...[groupMedian("hyperscaler"), groupMedian("neocloud")].flatMap((s) => s ?? []),
            ]}
          />
          <ChapterCharts>
            <ChartBlock
              title="Big tech: spending vs cash coming in"
              info={EXPLAINERS.capexIntensityHyper}
              subtitle="12-month capex ÷ 12-month operating cash flow · calculated"
              series={acrossGroup("hyperscaler", "capex_ocf_ttm")}
              labelOf={tickerLabel}
            />
            <ChartBlock
              title="Neoclouds: spending vs cash coming in"
              info={EXPLAINERS.capexIntensityNeo}
              subtitle="Blank where cash flow was negative · calculated"
              series={acrossGroup("neocloud", "capex_ocf_ttm")}
              labelOf={tickerLabel}
            />
          </ChapterCharts>
          <ChapterMore summary="Show 4 more peer charts: neocloud debt, order-book conversion, supplier payment days, supplier inventory days, and latest filings">
            <ChapterCharts>
              <ChartBlock
                title="Neoclouds: debt vs cash coming in"
                info={EXPLAINERS.leverageNeo}
                subtitle="(Debt + finance leases) ÷ 12-month operating cash flow · calculated"
                series={acrossGroup("neocloud", "debt_to_ocf")}
                labelOf={tickerLabel}
              />
              <ChartBlock
                title="How fast the order book turns into revenue"
                info={EXPLAINERS.conversionPeers}
                subtitle="12-month revenue ÷ order book (RPO) a year earlier · calculated"
                series={BACKLOG_PEERS.flatMap((t) => byId.get(`derived.${t}.rpo_conversion`) ?? [])}
                labelOf={tickerLabel}
              />
              <ChartBlock
                title="Suppliers: how long customers take to pay"
                info={EXPLAINERS.dsoPeers}
                subtitle="Days sales outstanding: receivables ÷ quarterly revenue × 91 · calculated"
                series={acrossGroup("supplier", "dso")}
                labelOf={tickerLabel}
              />
              <ChartBlock
                title="Suppliers: how long stock sits unsold"
                info={EXPLAINERS.inventoryDays}
                subtitle="Inventory days: inventory ÷ quarterly cost of revenue × 91 · calculated"
                series={acrossGroup("supplier", "inventory_days")}
                labelOf={tickerLabel}
              />
            </ChapterCharts>
            <FilingEvents events={filingEvents.slice(0, 12)} />
          </ChapterMore>
        </Chapter>

        <Chapter chapter={cash}>
          {selected ? (
            <EntityBand
              eyebrow="Chapters 02–06 follow one company"
              company={selected}
              blurb={GROUP_BLURBS[selected.group]}
              switches="company"
              link={
                hasDebtPage ? (
                  <Link to="/credit" search={{ company, range: "3y" }} hash="bycompany">
                    {name}'s debt, instrument by instrument →
                  </Link>
                ) : null
              }
            />
          ) : null}
          {picker("row")}
          {awaitingFundamentals ? (
            <p className="chapter-notice">
              Quarterly figures appear here once we collect XBRL data from a 10-K or 10-Q.{" "}
              <a href={`https://www.sec.gov/edgar/browse/?CIK=${selected.cik}`}>
                Browse {selected.name}'s SEC filings
              </a>
            </p>
          ) : null}
          <ChapterHeader
            index={2}
            total={total}
            chapter={cash}
            meta="SEC, quarterly"
            question={`Can ${name} pay for what it is building?`}
            watchFor="free cash flow staying negative while debt and leases grow faster than cash from operations."
            stats={[
              latestStat("Capex ÷ operating cash flow", capexOcf, "12 months · calculated", {
                tone: cashTone,
                missing: "Not calculated: needs positive 12-month operating cash flow",
              }),
              latestStat(
                "Free cash flow",
                one(`derived.${company}.fcf_ttm`),
                "12 months · calculated",
              ),
              latestStat(
                "Debt + leases ÷ cash flow",
                one(`derived.${company}.debt_to_ocf`),
                "latest quarter · calculated",
                { missing: "Not calculated: needs positive 12-month operating cash flow" },
              ),
            ]}
          />
          <ChapterCharts>
            <ChartBlock
              title="Capex vs cash from the business"
              info={EXPLAINERS.capexVsOcf}
              subtitle="Quarterly · some quarters are worked out from year-to-date totals"
              series={sec(["capex", "ocf"])}
            />
            <ChartBlock
              title="Debt and leases"
              info={EXPLAINERS.debtLeases}
              subtitle="What it owes at each quarter end"
              series={sec(["debt", "finance_leases", "operating_leases", "cash"])}
            />
          </ChapterCharts>
          <ChapterMore summary="Show 4 more: free cash flow, can it carry its debt, interest costs, purchase commitments">
            <ChapterCharts>
              <ChartBlock
                title="Free cash flow"
                info={EXPLAINERS.fcf}
                subtitle="Last 12 months: operating cash flow minus capex · calculated"
                series={derived(["fcf_ttm"])}
              />
              <ChartBlock
                title="Can it carry its debt?"
                info={EXPLAINERS.leverageCoverage}
                subtitle="Each line means something different, so compare it with its own history · calculated"
                series={derived(["debt_to_ocf", "interest_coverage_ttm"])}
              />
              <ChartBlock
                title="Interest costs"
                info={EXPLAINERS.interest}
                subtitle="Interest on the books vs interest actually paid"
                series={sec(["interest_expense", "interest_paid"])}
              />
              <ChartBlock
                title="Purchase commitments"
                info={EXPLAINERS.purchaseObligations}
                subtitle="Unconditional purchase obligations from the filing notes · missing for most companies"
                series={sec(["purchase_obligations"])}
              />
            </ChapterCharts>
          </ChapterMore>
          <IndicatorNotes def={indicatorById("capex_cashflow")} />
        </Chapter>

        <Chapter chapter={orders}>
          <ChapterHeader
            index={3}
            total={total}
            chapter={orders}
            meta="SEC, quarterly"
            question="Is the order book turning into revenue?"
            watchFor="the order book growing much faster than revenue, or receivables piling up."
            stats={[
              latestStat("Order book (RPO)", one(`sec.${company}.rpo`), "quarter end"),
              latestStat(
                "Revenue ÷ order book a year earlier",
                one(`derived.${company}.rpo_conversion`),
                "12 months · calculated",
              ),
              latestStat("Days to collect payment", one(`derived.${company}.dso`), "calculated"),
            ]}
          />
          <ChapterCharts>
            <ChartBlock
              title="Order book vs revenue"
              info={EXPLAINERS.backlog}
              subtitle="Order book (RPO) at quarter end, quarterly revenue and receivables"
              series={sec(["rpo", "revenue", "ar"])}
            />
            <ChartBlock
              title="Growth vs a year ago"
              info={EXPLAINERS.growth}
              subtitle="Order book, 12-month revenue and receivables, year on year · calculated"
              series={derived(["rpo_yoy", "revenue_ttm_yoy", "ar_yoy"])}
            />
          </ChapterCharts>
          <ChapterMore summary="Show 3 more: conversion ratio, collection and stock days, inventory">
            <ChapterCharts>
              <ChartBlock
                title="Order book to revenue"
                info={EXPLAINERS.conversion}
                subtitle="12-month revenue ÷ order book a year earlier · calculated"
                series={derived(["rpo_conversion"])}
              />
              <ChartBlock
                title="Collection and stock days"
                info={EXPLAINERS.dsoInventory}
                subtitle="Receivables and inventory in days of quarterly revenue and cost of revenue · calculated"
                series={derived(["dso", "inventory_days"])}
              />
              <ChartBlock
                title="Inventory"
                info={EXPLAINERS.inventoryBalance}
                subtitle="Net inventory and quarterly cost of revenue"
                series={sec(["inventory", "cogs"])}
              />
            </ChapterCharts>
          </ChapterMore>
          <IndicatorNotes def={indicatorById("contract_conversion")} />
        </Chapter>

        <Chapter chapter={customers}>
          <ChapterHeader
            index={4}
            total={total}
            chapter={customers}
            meta="From filings"
            question="How much depends on a handful of customers?"
            watchFor="one or two customers making up most of revenue, or a single customer's share swinging sharply between quarters."
            stats={[
              largestCustomerStat("fy"),
              largestCustomerStat("q"),
              latestStat(
                "Top two customers, latest quarter",
                one(`customer_concentration.${company}.top2_pct_q`),
                "single quarter",
                concentrationMissing,
              ),
            ]}
          />
          <ChapterCharts>
            <ChartBlock
              title="Biggest customer's share of revenue, full year"
              info={EXPLAINERS.concentrationFy}
              subtitle="As disclosed in annual filings"
              series={concentration.filter((s) => s.id.endsWith("_pct_fy"))}
              labelOf={concentrationLabel}
              emptyReason={concentrationEmpty}
            />
            <ChartBlock
              title="Biggest customers' share, single quarters"
              info={EXPLAINERS.concentrationQ}
              subtitle="Kept apart from full-year disclosures"
              series={concentration.filter((s) => s.id.endsWith("_pct_q"))}
              labelOf={concentrationLabel}
              emptyReason={concentrationEmpty}
            />
          </ChapterCharts>
          <TermsTable
            title="Announced customer contracts"
            info={EXPLAINERS.contracts}
            subtitle="Total value as announced · not guaranteed revenue"
            series={concentration.filter((s) => s.id.includes("contract_value"))}
            emptyReason={
              concentrationTracked
                ? "No contract announcements are entered for this company."
                : concentrationEmpty
            }
          />
          <IndicatorNotes def={indicatorById("customer_concentration")} />
        </Chapter>

        <Chapter chapter={insiders}>
          <ChapterHeader
            index={5}
            total={total}
            chapter={insiders}
            meta="SEC Form 4, monthly"
            question="Are insiders selling?"
            watchFor="large open-market sales outside pre-arranged 10b5-1 plans."
            stats={[
              {
                label: "Open-market sales",
                value: insiderSalesValue(insiderTotal != null, insider),
                note: insiderTotal ? windowNote : "No Form 4 sales collected for this company",
              },
              {
                label: "Of which under 10b5-1 plans",
                value: insider.plannedShare == null ? null : pct0(insider.plannedShare * 100),
                note:
                  insider.plannedShare == null
                    ? "Needs the 10b5-1 flag on every month with sales"
                    : windowNote,
              },
            ]}
          />
          <ChapterCharts one>
            <ChartBlock
              title="Insider open-market sales"
              info={EXPLAINERS.insiderSales}
              subtitle="Monthly shares × price on Form 4 sales · the second line is sales under 10b5-1 plans · calculated"
              series={pick([
                `insider.${company}.open_market_sales_usd`,
                `insider.${company}.open_market_sales_10b5_1_usd`,
              ])}
              emptyReason="No priced open-market sales found for this company yet."
            />
          </ChapterCharts>
          <IndicatorNotes def={indicatorById("insider_activity")} />
        </Chapter>

        <Chapter chapter={depreciation}>
          <ChapterHeader
            index={6}
            total={total}
            chapter={depreciation}
            meta="From filings"
            question="Are servers assumed to last longer than they should?"
            watchFor="longer assumed lifespans, which flatter profits, while spare cash shrinks."
            stats={[
              ownLife?.latest
                ? {
                    label: `${name}, assumed server life`,
                    value: years(ownLife.latest.value),
                    note: `Since ${formatMonthYear(ownLife.latest.periodEnd)}${
                      ownLifePrior ? `, from ${years(ownLifePrior.value)}` : ""
                    }`,
                  }
                : {
                    label: `${name}, assumed server life`,
                    value: null,
                    note: "No useful-life disclosure entered for this company",
                  },
              {
                label: `Hyperscalers at ${maxLife == null ? "the longest life" : years(maxLife)}`,
                value:
                  maxLife == null
                    ? null
                    : `${hyperLatest.filter((v) => v === maxLife).length} of ${hyperLatest.length}`,
                note: "Latest disclosed server life · calculated",
              },
              latestStat("Depreciation, latest quarter", one(`sec.${company}.da`), "SEC"),
            ]}
          />
          <ChapterCharts one>
            <ChartBlock
              title="How long servers are assumed to last"
              info={EXPLAINERS.usefulLife}
              subtitle="Each step is a change the company announced"
              series={lives}
              stepped
              labelOf={tickerLabel}
              emptyReason="Changes are added by hand from company filings, with citations."
            />
          </ChapterCharts>
          <ChapterMore
            summary={`Show depreciation & amortization for ${name}, and network-equipment lifespans`}
          >
            <ChapterCharts>
              <ChartBlock
                title={`${name}: depreciation & amortization`}
                info={EXPLAINERS.da}
                subtitle="Quarterly cost of equipment wearing out"
                series={sec(["da"])}
              />
              <ChartBlock
                title="How long network equipment is assumed to last"
                info={EXPLAINERS.usefulLife}
                subtitle="Each step is a change the company announced"
                series={manual("depreciation").filter((s) => !LIFE_SERIES.test(s.id))}
                stepped
                labelOf={tickerLabel}
                emptyReason="Changes are added by hand from company filings, with citations."
              />
            </ChapterCharts>
          </ChapterMore>
          <IndicatorNotes def={indicatorById("depreciation")} />
        </Chapter>
      </ChapterLayout>
    </>
  );
}

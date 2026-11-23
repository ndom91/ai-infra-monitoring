import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { PageLead } from "~/components/PageLead";
import { SectionHeader } from "~/components/SectionHeader";
import { TermsTable } from "~/components/TermsTable";
import { SEC_COMPANIES } from "~/domain/companies";
import { EXPLAINERS } from "~/domain/explainers";
import { indicatorById, SECTIONS } from "~/domain/indicators";
import { parseRange } from "~/domain/ranges";
import { pageHead } from "~/lib/seo";
import { getSectionData, type SeriesView } from "~/server/data";

export const Route = createFileRoute("/credit")({
  head: () =>
    pageHead(
      "/credit",
      "Credit Risk",
      "Follow borrowing costs, leverage, and refinancing pressure across AI infrastructure companies.",
    ),
  validateSearch: (s) => ({ range: parseRange(s.range, "3y") }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) => getSectionData({ data: { indicators: ["credit"], range: deps.range } }),
  component: CreditPage,
});

function pick(series: SeriesView[], ids: string[]) {
  return ids.flatMap((id) => series.filter((s) => s.id === id));
}

const NEOCLOUDS = SEC_COMPANIES.filter((c) => c.group === "neocloud");
const RATE_METRICS = [".stated_rate", ".effective_rate", ".variable_rate_spread"];

// Series ids are sec_debt.TICKER.instrument[.qualifier].metric.
const instrumentOf = (s: SeriesView) => s.id.split(".")[2];

// Labels are "Instrument (qualifier) — metric"; charts show the instrument part.
const instrumentLabel = (s: SeriesView) => s.label.split(" — ")[0] ?? s.label;

// Instruments with a balance at the company's latest reported date. Repaid and
// renamed instruments are left out so the chart stays readable.
function outstandingDebt(series: SeriesView[], ticker: string) {
  const carrying = series.filter(
    (s) => s.collector === "sec_debt" && s.entity === ticker && s.id.endsWith(".carrying_amount"),
  );
  const latestEnd = carrying
    .map((s) => s.latest?.periodEnd ?? "")
    .sort()
    .at(-1);
  const current = carrying.filter(
    (s) => s.latest?.periodEnd === latestEnd && (s.latest?.value ?? 0) > 0,
  );
  const instruments = new Set(current.map(instrumentOf));
  // Only each rate's latest filed value is listed, not its history.
  const rates = series
    .filter(
      (s) =>
        s.collector === "sec_debt" &&
        s.entity === ticker &&
        RATE_METRICS.some((m) => s.id.endsWith(m)) &&
        instruments.has(instrumentOf(s)),
    )
    .map((s) => ({ ...s, points: [] }));
  return { current, rates };
}

function CreditPage() {
  const { series } = Route.useLoaderData();
  const { range } = Route.useSearch();
  const section = SECTIONS.find((s) => s.id === "credit");
  const issuer = series.filter((s) => s.collector === "manual");
  const debtByCompany = NEOCLOUDS.map((company) => ({
    company,
    ...outstandingDebt(series, company.ticker),
  }));

  return (
    <>
      <SectionHeader
        title={section?.label ?? "Credit"}
        blurb={section?.blurb ?? ""}
        range={range}
      />
      <PageLead title="Separate market stress from disclosed debt terms">
        The charts first show broad credit-market conditions, from riskier borrowers to safer
        benchmarks and the wider rate backdrop. The table below is different: it records the coupon
        and terms when AI companies issued debt, not a live market price. The last section lists
        each neocloud's debt instrument by instrument, from its SEC filings.
      </PageLead>
      <IndicatorPanel def={indicatorById("credit")}>
        <div className="grid-2">
          <ChartBlock
            title="Junk-bond borrowing costs, by rating"
            info={EXPLAINERS.hySpreads}
            subtitle="Extra interest over US government bonds (option-adjusted spread)"
            series={pick(series, [
              "fred.BAMLH0A0HYM2",
              "fred.BAMLH0A1HYBB",
              "fred.BAMLH0A2HYB",
              "fred.BAMLH0A3HYC",
            ])}
          />
          <ChartBlock
            title="Borrowing costs, safer companies"
            info={EXPLAINERS.igSpreads}
            subtitle="BBB-rated spread (last 3 years) and Moody's Baa minus 10-year Treasury (long history)"
            series={pick(series, ["fred.BAMLC0A4CBBB", "fred.BAA10Y"])}
          />
          <ChartBlock
            title="Total interest rates"
            info={EXPLAINERS.yields}
            subtitle="These move with all interest rates, not just credit risk"
            series={pick(series, ["fred.BAMLH0A0HYM2EY", "fred.DBAA", "fred.DGS10"])}
          />
        </div>
        <TermsTable
          title="What AI companies pay to borrow"
          info={EXPLAINERS.issuerDebt}
          subtitle="Rates agreed when the debt was issued, from filings. Not today's market price."
          series={issuer}
        />
        <h3 className="sub-head">Neocloud debt by instrument</h3>
        {debtByCompany.map(({ company, current, rates }) => (
          <div className="grid-2" key={company.ticker}>
            <ChartBlock
              title={`${company.name}: debt by instrument`}
              info={EXPLAINERS.instrumentDebt}
              subtitle="Carrying amount at each filing date, for instruments with a balance at the latest one"
              series={current}
              labelOf={instrumentLabel}
              emptyReason="No instrument-level debt has been collected from this company's filings yet."
            />
            <TermsTable
              title={`${company.name}: latest rates`}
              subtitle="Latest figure filed for each instrument. Not today's market price."
              series={rates}
              labelOf={(s) => s.label}
            />
          </div>
        ))}
      </IndicatorPanel>
    </>
  );
}

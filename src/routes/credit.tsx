import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { SectionHeader } from "~/components/SectionHeader";
import { TermsTable } from "~/components/TermsTable";
import { EXPLAINERS } from "~/domain/explainers";
import { indicatorById, SECTIONS } from "~/domain/indicators";
import { parseRange } from "~/domain/ranges";
import { getSectionData, type SeriesView } from "~/server/data";

export const Route = createFileRoute("/credit")({
  validateSearch: (s) => ({ range: parseRange(s.range, "3y") }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) => getSectionData({ data: { indicators: ["credit"], range: deps.range } }),
  component: CreditPage,
});

function pick(series: SeriesView[], ids: string[]) {
  return ids.flatMap((id) => series.filter((s) => s.id === id));
}

function CreditPage() {
  const { series } = Route.useLoaderData();
  const { range } = Route.useSearch();
  const section = SECTIONS.find((s) => s.id === "credit");
  const issuer = series.filter((s) => s.collector === "manual");

  return (
    <>
      <SectionHeader
        title={section?.label ?? "Credit"}
        blurb={section?.blurb ?? ""}
        range={range}
      />
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
      </IndicatorPanel>
    </>
  );
}

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
            title="High-yield spreads by rating"
            info={EXPLAINERS.hySpreads}
            subtitle="Option-adjusted spread over Treasuries"
            series={pick(series, [
              "fred.BAMLH0A0HYM2",
              "fred.BAMLH0A1HYBB",
              "fred.BAMLH0A2HYB",
              "fred.BAMLH0A3HYC",
            ])}
          />
          <ChartBlock
            title="Investment-grade spreads"
            info={EXPLAINERS.igSpreads}
            subtitle="BBB OAS (3y window) and Moody's Baa − 10y (long history)"
            series={pick(series, ["fred.BAMLC0A4CBBB", "fred.BAA10Y"])}
          />
          <ChartBlock
            title="Yields vs rates"
            info={EXPLAINERS.yields}
            subtitle="Absolute yields: these move with rates, not just credit risk"
            series={pick(series, ["fred.BAMLH0A0HYM2EY", "fred.DBAA", "fred.DGS10"])}
          />
        </div>
        <TermsTable
          title="AI infrastructure issuer debt"
          info={EXPLAINERS.issuerDebt}
          subtitle="Coupons and loan margins at issue, from filings. Issue terms, not trading yields."
          series={issuer}
        />
      </IndicatorPanel>
    </>
  );
}

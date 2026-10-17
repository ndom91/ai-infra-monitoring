import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { SectionHeader } from "~/components/SectionHeader";
import { indicatorById, SECTIONS } from "~/domain/indicators";
import { parseRange } from "~/domain/ranges";
import { getSectionData, type SeriesView } from "~/server/data";

export const Route = createFileRoute("/market")({
  validateSearch: (s) => ({ range: parseRange(s.range, "3y") }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) =>
    getSectionData({ data: { indicators: ["gpu_rental", "gpu_resale"], range: deps.range } }),
  component: MarketPage,
});

// Series ids look like "<provider>.<cohort>.<region>.<pricetype>".
const cohortOf = (s: SeriesView) => s.id.split(".")[1] ?? "";

function MarketPage() {
  const { series } = Route.useLoaderData();
  const { range } = Route.useSearch();
  const section = SECTIONS.find((s) => s.id === "market");
  const rental = series.filter((s) => s.indicator === "gpu_rental");
  const resale = series.filter((s) => s.indicator === "gpu_resale");
  const shortLabel = (s: SeriesView) => {
    const [provider, , region, type] = s.id.split(".");
    return `${provider === "aws" ? "AWS" : "Azure"} ${type === "ondemand" ? "on-demand" : type} (${region})`;
  };

  return (
    <>
      <SectionHeader
        title={section?.label ?? "Market"}
        blurb={section?.blurb ?? ""}
        range={range}
      />
      <IndicatorPanel def={indicatorById("gpu_rental")}>
        <div className="grid-2">
          {[
            ["h100", "H100 80GB"],
            ["h200", "H200 141GB"],
          ].map(([cohort, label]) => (
            <ChartBlock
              key={cohort}
              title={`${label}: list price per GPU-hour`}
              subtitle="Instance list price divided by GPUs per instance"
              series={rental.filter((s) => cohortOf(s) === cohort)}
              labelOf={shortLabel}
              stepped
              emptyReason="Run pnpm collect azure aws to collect list prices."
            />
          ))}
        </div>
      </IndicatorPanel>
      <IndicatorPanel def={indicatorById("gpu_resale")}>
        <ChartBlock
          title="GPU resale values"
          subtitle="Published index points, cited manually"
          series={resale}
          emptyReason="No licensed resale index is available yet. See Coverage for why."
        />
      </IndicatorPanel>
    </>
  );
}

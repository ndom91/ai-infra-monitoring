import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { SectionHeader } from "~/components/SectionHeader";
import { EXPLAINERS } from "~/domain/explainers";
import { indicatorById, SECTIONS } from "~/domain/indicators";
import { parseRange } from "~/domain/ranges";
import { pageHead } from "~/lib/seo";
import { getSectionData, type SeriesView } from "~/server/data";

export const Route = createFileRoute("/market")({
  head: () =>
    pageHead(
      "/market",
      "GPU Market",
      "Track public GPU rental and resale prices across major cloud providers.",
    ),
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
    const name = provider === "aws" ? "AWS" : provider === "azure" ? "Azure" : "Salad";
    return `${name} ${(type ?? "").replaceAll("_", " ")} (${region})`;
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
            ["rtx4090", "RTX 4090 24GB"],
            ["rtx5090", "RTX 5090 32GB"],
          ].map(([cohort, label]) => {
            const isConsumer = cohort?.startsWith("rtx");
            return (
              <ChartBlock
                key={cohort}
                title={`${label}: price per GPU-hour`}
                info={EXPLAINERS.gpuListPrice}
                subtitle={
                  isConsumer
                    ? "Published hourly price; priority tiers remain separate"
                    : "Machine list price divided by the GPUs in it"
                }
                series={rental.filter((s) => cohortOf(s) === cohort)}
                labelOf={shortLabel}
                stepped
                emptyReason="No price data collected yet."
              />
            );
          })}
        </div>
      </IndicatorPanel>
      <IndicatorPanel def={indicatorById("gpu_resale")}>
        <ChartBlock
          title="Used GPU prices"
          info={EXPLAINERS.gpuResale}
          subtitle="Published index, entered by hand with a citation"
          series={resale}
          emptyReason="No used-GPU price index we're allowed to use yet. The Coverage page explains why."
        />
      </IndicatorPanel>
    </>
  );
}

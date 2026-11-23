import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { PageLead } from "~/components/PageLead";
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

function MarketPage() {
  const { series } = Route.useLoaderData();
  const { range } = Route.useSearch();
  const section = SECTIONS.find((s) => s.id === "market");
  const rental = series.filter((s) => s.indicator === "gpu_rental");
  const resale = series.filter((s) => s.indicator === "gpu_resale");
  // Series ids look like "<provider>.<cohort>.<region>.<pricetype>"; the
  // entity is the GPU cohort and the source names the provider.
  const cohorts = new Map<string, SeriesView[]>();
  for (const s of rental) {
    const key = s.entity ?? "Other";
    cohorts.set(key, [...(cohorts.get(key) ?? []), s]);
  }
  const shortLabel = (s: SeriesView) => {
    const [, , region, type] = s.id.split(".");
    return `${s.source} ${(type ?? "").replaceAll("_", " ")} (${region})`;
  };

  return (
    <>
      <SectionHeader
        title={section?.label ?? "Market"}
        blurb={section?.blurb ?? ""}
        range={range}
      />
      <PageLead title="Start with public rental list prices">
        Compare like-for-like GPU-hour list prices by accelerator class, provider, region, and tier.
        These are published offers rather than transaction prices. The separate resale section is
        limited to cited, permitted secondary-market evidence.
      </PageLead>
      <IndicatorPanel def={indicatorById("gpu_rental")}>
        <div className="grid-2">
          {[...cohorts]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([entity, cohortSeries]) => {
              const isConsumer = entity.startsWith("RTX");
              return (
                <ChartBlock
                  key={entity}
                  title={`${entity}: price per GPU-hour`}
                  info={EXPLAINERS.gpuListPrice}
                  subtitle={
                    isConsumer
                      ? "Published hourly price; priority tiers remain separate"
                      : "Machine list price divided by the GPUs in it"
                  }
                  series={cohortSeries}
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

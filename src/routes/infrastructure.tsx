import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { SectionHeader } from "~/components/SectionHeader";
import { indicatorById, SECTIONS } from "~/domain/indicators";
import { parseRange } from "~/domain/ranges";
import type { IndicatorId } from "~/domain/types";
import { getSectionData, type SeriesView } from "~/server/data";

export const Route = createFileRoute("/infrastructure")({
  validateSearch: (s) => ({ range: parseRange(s.range, "max") }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) =>
    getSectionData({ data: { indicators: ["construction", "vacancy"], range: deps.range } }),
  component: InfrastructurePage,
});

// One chart per publisher and unit: CBRE and JLL use different market
// definitions, so their figures never share a chart.
function groups(series: SeriesView[], indicator: IndicatorId) {
  const map = new Map<string, SeriesView[]>();
  for (const s of series.filter((x) => x.indicator === indicator)) {
    const key = `${s.source} · ${s.unit}`;
    map.set(key, [...(map.get(key) ?? []), s]);
  }
  return [...map.entries()];
}

function InfrastructurePage() {
  const { series } = Route.useLoaderData();
  const { range } = Route.useSearch();
  const section = SECTIONS.find((s) => s.id === "infrastructure");

  return (
    <>
      <SectionHeader
        title={section?.label ?? "Infrastructure"}
        blurb={section?.blurb ?? ""}
        range={range}
      />
      {(["construction", "vacancy"] as const).map((indicator) => {
        const g = groups(series, indicator);
        return (
          <IndicatorPanel key={indicator} def={indicatorById(indicator)}>
            {g.length === 0 ? (
              <ChartBlock
                title="No series yet"
                series={[]}
                emptyReason="Broker reports are entered manually with citations in data/manual/."
              />
            ) : (
              <div className="grid-2">
                {g.map(([key, list]) => (
                  <ChartBlock key={key} title={key} series={list} />
                ))}
              </div>
            )}
          </IndicatorPanel>
        );
      })}
    </>
  );
}

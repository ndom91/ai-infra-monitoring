import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { SectionHeader } from "~/components/SectionHeader";
import { infraExplainer } from "~/domain/explainers";
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

// One chart per publisher market definition ("cbre.na_primary", "jll.na_colo"),
// unit, and cadence. Publishers and coverage changes never share a chart, and
// annual totals never sit next to half-year figures.
function groups(series: SeriesView[], indicator: IndicatorId) {
  const map = new Map<string, { title: string; list: SeriesView[] }>();
  for (const s of series.filter((x) => x.indicator === indicator)) {
    const family = s.id.split(".").slice(0, 2).join(".");
    const key = `${family}|${s.unit}|${s.cadence}`;
    const title = `${s.source}${s.entity ? ` · ${s.entity}` : ""} (${s.unit}${s.cadence === "annual" ? ", annual" : ""})`;
    const g = map.get(key) ?? { title, list: [] };
    g.list.push(s);
    map.set(key, g);
  }
  return [...map.values()];
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
                {g.map(({ title, list }) => (
                  <ChartBlock
                    key={title}
                    title={title}
                    series={list}
                    info={infraExplainer(list.map((x) => x.id))}
                  />
                ))}
              </div>
            )}
          </IndicatorPanel>
        );
      })}
    </>
  );
}

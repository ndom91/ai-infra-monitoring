import { createFileRoute } from "@tanstack/react-router";
import { ChartBlock } from "~/components/ChartBlock";
import { IndicatorPanel } from "~/components/IndicatorPanel";
import { PageLead } from "~/components/PageLead";
import { SectionHeader } from "~/components/SectionHeader";
import { infraExplainer } from "~/domain/explainers";
import { indicatorById, SECTIONS } from "~/domain/indicators";
import { parseRange } from "~/domain/ranges";
import type { IndicatorId } from "~/domain/types";
import { pageHead } from "~/lib/seo";
import { getSectionData, type SeriesView } from "~/server/data";

const HISTORICAL_JLL_FAMILIES: Record<string, string> = {
  "jll.us_colo": "JLL's U.S. colocation coverage ended after Midyear 2024.",
  "jll.na_colo": "JLL's North America colocation coverage ended after Midyear 2025.",
};

export const Route = createFileRoute("/infrastructure")({
  head: () =>
    pageHead(
      "/infrastructure",
      "Data Center Infrastructure",
      "Track data-center construction, vacancy, and pre-leasing in North America.",
    ),
  validateSearch: (s) => ({ range: parseRange(s.range, "max") }),
  loaderDeps: ({ search }) => ({ range: search.range }),
  loader: ({ deps }) =>
    getSectionData({
      data: { indicators: ["construction", "vacancy", "power_grid"], range: deps.range },
    }),
  component: InfrastructurePage,
});

// One chart per publisher market definition ("cbre.na_primary", "jll.na_colo"),
// unit, and cadence. Publishers and coverage changes never share a chart, and
// annual totals never sit next to half-year figures.
function groups(series: SeriesView[], indicator: IndicatorId) {
  const map = new Map<string, { family: string; title: string; list: SeriesView[] }>();
  for (const s of series.filter((x) => x.indicator === indicator)) {
    const family = s.id.split(".").slice(0, 2).join(".");
    const key = `${family}|${s.unit}|${s.cadence}`;
    const title = `${s.source}${s.entity ? ` · ${s.entity}` : ""} (${s.unit}${s.cadence === "annual" ? ", annual" : ""})`;
    const g = map.get(key) ?? { family, title, list: [] };
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
      <PageLead title="Read supply, availability, then the power backdrop">
        Construction shows the supply being added, vacancy shows how much immediately available
        space remains, and power data adds state-wide commercial context. Publisher market
        definitions stay separate; they are not combined into a single North America total.
      </PageLead>
      {(["construction", "vacancy", "power_grid"] as const).map((indicator) => {
        const g = groups(series, indicator);
        const active = g.filter((group) => !HISTORICAL_JLL_FAMILIES[group.family]);
        const historical = g.filter((group) => HISTORICAL_JLL_FAMILIES[group.family]);
        return (
          <IndicatorPanel key={indicator} def={indicatorById(indicator)}>
            {active.length === 0 ? (
              <ChartBlock
                title="No series yet"
                series={[]}
                emptyReason={
                  indicator === "power_grid"
                    ? "The EIA collector has not published any selected-state observations yet."
                    : "Broker reports are added by hand when they come out."
                }
              />
            ) : (
              <div className="grid-2">
                {active.map(({ title, list }) => (
                  <ChartBlock
                    key={title}
                    title={title}
                    series={list}
                    info={infraExplainer(list.map((x) => x.id))}
                  />
                ))}
              </div>
            )}
            {historical.length > 0 && (
              <details className="readme infrastructure-history">
                <summary>Historical JLL coverage ({historical.length})</summary>
                <p>
                  JLL changed its market coverage, so these series cannot be joined to the current
                  North America figures. They are retained for reference only.
                </p>
                <div className="grid-2">
                  {historical.map(({ family, title, list }) => (
                    <ChartBlock
                      key={title}
                      title={title}
                      subtitle={HISTORICAL_JLL_FAMILIES[family]}
                      series={list}
                      info={infraExplainer(list.map((x) => x.id))}
                    />
                  ))}
                </div>
              </details>
            )}
          </IndicatorPanel>
        );
      })}
    </>
  );
}

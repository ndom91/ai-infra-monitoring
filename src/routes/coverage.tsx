import { createFileRoute } from "@tanstack/react-router";
import { Chapter, type ChapterDef, ChapterHeader, ChapterMore } from "~/components/Chapters";
import { PageIntro } from "~/components/PageIntro";
import { RunTable } from "~/components/RunTable";
import { SignalDot } from "~/components/SignalDot";
import type { Stat } from "~/components/StatList";
import type { Signal } from "~/domain/chapterSignals";
import { COVERAGE, COVERAGE_LABEL, type CoverageStatus } from "~/domain/coverage";
import { INDICATORS } from "~/domain/indicators";
import { pageHead } from "~/lib/seo";
import { getCoverageData } from "~/server/data";

export const Route = createFileRoute("/coverage")({
  head: () =>
    pageHead(
      "/coverage",
      "Coverage & Data Health",
      "See what the monitor's indicators cover, where the gaps are, and when each collector last ran.",
    ),
  loader: () => getCoverageData(),
  component: CoveragePage,
});

const COVERAGE_SIGNAL: Record<CoverageStatus, Signal> = {
  implemented: "reassuring",
  partial: "mixed",
  unavailable: "worsening",
};

const indicators: ChapterDef = {
  slug: "indicators",
  label: "Indicators",
  sub: "",
  signal: "context",
};
const collectors: ChapterDef = {
  slug: "collectors",
  label: "Collectors",
  sub: "",
  signal: "context",
};

function CoveragePage() {
  const { seriesCounts, runs, latest } = Route.useLoaderData();
  const sorted = [...INDICATORS].sort((a, b) => a.number.localeCompare(b.number));
  const withStatus = (s: CoverageStatus) =>
    sorted.filter((i) => COVERAGE[i.id].status === s).length;
  const seriesTotal = sorted.reduce((sum, i) => sum + (seriesCounts[i.id] ?? 0), 0);
  const stats: Stat[] = [
    {
      label: "Full coverage",
      value: String(withStatus("implemented")),
      note: `of ${sorted.length} indicators`,
    },
    {
      label: "Partial coverage",
      value: String(withStatus("partial")),
      note: "gaps listed beside each",
    },
    { label: "Series stored", value: String(seriesTotal), note: "across all indicators" },
  ];

  return (
    <>
      <PageIntro eyebrow="Coverage" title="What can this monitor see, and what is missing?">
        Start with scope: each indicator lists what its data can support and where it falls short.
        Then check collection: the collectors table shows each job's latest run and whether it
        worked, and the run history is there for investigating a failed, partial or unexpected
        update.
      </PageIntro>

      <Chapter chapter={indicators}>
        <ChapterHeader
          index={1}
          total={2}
          chapter={indicators}
          question="What does each indicator cover, and where are the gaps?"
          lede="Status says how much of an indicator's intended scope is collected. Gaps include sources left out because their terms forbid automated collection."
          stats={stats}
        />
        <table className="stats coverage-table">
          <thead>
            <tr>
              <th className="c-name">Indicator</th>
              <th className="c-status">Status</th>
              <th className="num c-series">Series</th>
              <th className="c-notes">Notes and gaps</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((i) => {
              const c = COVERAGE[i.id];
              return (
                <tr key={i.id}>
                  <td className="cov-name">
                    <span className="cov-number">{i.number}</span> {i.title}
                  </td>
                  <td className="cov-status">
                    <SignalDot
                      signal={COVERAGE_SIGNAL[c.status]}
                      label={COVERAGE_LABEL[c.status]}
                    />
                  </td>
                  <td className="num cov-series">{seriesCounts[i.id] ?? 0}</td>
                  <td className="cov-notes">
                    <p>{c.summary}</p>
                    {c.gaps.length > 0 && (
                      <ul>
                        {c.gaps.map((g) => (
                          <li key={g}>{g}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Chapter>

      <Chapter chapter={collectors}>
        <ChapterHeader
          index={2}
          total={2}
          chapter={collectors}
          question="Is data still arriving, and did the latest runs work?"
          lede="Each collector's most recent run. The status describes that run only, not how old the data is: a partly failed run stored what it could and names what it could not fetch."
        />
        <p className="run-key">
          <b>New</b> values stored for the first time. <b>Revised</b> values that changed for a
          period already stored; the new value is added and the earlier one is kept.{" "}
          <b>Unchanged</b> values already stored with the same figure; nothing is written.
        </p>
        {latest.length === 0 ? (
          <div className="no-data">
            <b>No data collected yet</b>
            <span>No collector has run against this database.</span>
          </div>
        ) : (
          <RunTable runs={latest} />
        )}
        <ChapterMore summary={`Run history, latest ${runs.length} runs`}>
          <RunTable runs={runs} />
        </ChapterMore>
      </Chapter>
    </>
  );
}

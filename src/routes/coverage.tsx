import { createFileRoute } from "@tanstack/react-router";
import { FreshnessBadge } from "~/components/FreshnessBadge";
import { SectionHeader } from "~/components/SectionHeader";
import { COVERAGE, COVERAGE_LABEL } from "~/domain/coverage";
import { INDICATORS } from "~/domain/indicators";
import { formatDateTime } from "~/lib/format";
import { pageHead } from "~/lib/seo";
import { getCoverageData } from "~/server/data";

export const Route = createFileRoute("/coverage")({
  head: () =>
    pageHead(
      "/coverage",
      "Coverage & Data Health",
      "See the monitor's data coverage, sources, freshness, and known gaps.",
    ),
  loader: () => getCoverageData(),
  component: CoveragePage,
});

function CoveragePage() {
  const { seriesCounts, runs, latest } = Route.useLoaderData();
  return (
    <>
      <SectionHeader
        title="Coverage & data health"
        blurb="What each indicator can and can't show, where the data comes from, and how recent data pulls went."
      />
      <section className="panel">
        <h2>What we cover</h2>
        <div className="table-scroll">
          <table className="stats coverage">
            <thead>
              <tr>
                <th>Indicator</th>
                <th>Status</th>
                <th className="num">Series</th>
                <th>Notes and gaps</th>
              </tr>
            </thead>
            <tbody>
              {INDICATORS.map((i) => {
                const c = COVERAGE[i.id];
                const n = seriesCounts[i.id] ?? 0;
                return (
                  <tr key={i.id}>
                    <td>
                      {i.number} {i.title}
                    </td>
                    <td>
                      <span className={`badge cov-${c.status}`}>{COVERAGE_LABEL[c.status]}</span>
                    </td>
                    <td className="num">{n}</td>
                    <td>
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
        </div>
      </section>

      <section className="panel">
        <h2>Collectors</h2>
        <div className="table-scroll">
          <table className="stats">
            <thead>
              <tr>
                <th>Collector</th>
                <th>Last run</th>
                <th>Status</th>
                <th className="num">New</th>
                <th className="num">Revised</th>
                <th className="num">Unchanged</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((r) => (
                <tr key={r.id}>
                  <td>
                    <code>{r.collector}</code>
                  </td>
                  <td className="muted">{formatDateTime(r.startedAt)} UTC</td>
                  <td>
                    <FreshnessBadge
                      state={
                        r.status === "ok"
                          ? "current"
                          : r.status === "failed"
                            ? "unavailable"
                            : "stale"
                      }
                    />{" "}
                    <span className="muted">{r.status}</span>
                  </td>
                  <td className="num">{r.inserted}</td>
                  <td className="num">{r.revised}</td>
                  <td className="num">{r.unchanged}</td>
                  <td className="muted">{r.message ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="readme">
          <summary>Run history ({runs.length})</summary>
          <div className="table-scroll">
            <table className="stats">
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <code>{r.collector}</code>
                    </td>
                    <td className="muted">{formatDateTime(r.startedAt)}</td>
                    <td>{r.status}</td>
                    <td className="num">
                      +{r.inserted} / ~{r.revised} / ={r.unchanged}
                    </td>
                    <td className="muted">
                      {r.errorClass ? `${r.errorClass}: ` : ""}
                      {r.message ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </>
  );
}

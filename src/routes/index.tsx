import { createFileRoute, Link } from "@tanstack/react-router";
import { DivergenceChart } from "~/components/DivergenceChart";
import { InfoTip } from "~/components/InfoTip";
import { SeriesStats } from "~/components/SeriesStats";
import { EXPLAINERS, type Explainer } from "~/domain/explainers";
import { formatDate } from "~/lib/format";
import { getOverviewData } from "~/server/overview";

const DIVERGENCE_INFO: Record<string, Explainer> = {
  rental_vs_capex: EXPLAINERS.divRentalCapex,
  spreads_vs_backlog: EXPLAINERS.divSpreadsBacklog,
  collateral_vs_debt: EXPLAINERS.divCollateralDebt,
  construction_vs_preleasing: EXPLAINERS.divConstructionPreleasing,
  lives_vs_cash: EXPLAINERS.divLivesFcf,
};

export const Route = createFileRoute("/")({
  loader: () => getOverviewData(),
  component: Overview,
});

function Overview() {
  const { headline, alerts, divergences } = Route.useLoaderData();
  return (
    <>
      <div className="section-head">
        <div>
          <h1>Overview</h1>
          <p>
            The latest readings, recent alerts, and divergences worth watching. Observations, not
            forecasts.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Credit</h2>
          <SeriesStats series={headline.credit} />
          <Link to="/credit" search={{ range: "3y" }} className="more">
            Credit detail →
          </Link>
        </section>
        <section className="panel">
          <h2>Recent alerts</h2>
          {alerts.length === 0 ? (
            <p className="muted">No alerts have fired.</p>
          ) : (
            <ul className="alert-mini">
              {alerts.map((a) => (
                <li key={a.id} className={`sev-${a.severity}`}>
                  <span className="badge">{a.severity}</span>
                  <span className="muted">{formatDate(a.triggeredAt)}</span>
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/alerts" className="more">
            All alerts →
          </Link>
        </section>
      </div>

      <section className="panel">
        <h2>Capex intensity</h2>
        <p className="muted">
          Trailing-12-month capex / operating cash flow. Above 1× means capex exceeds cash from
          operations.
        </p>
        <SeriesStats series={headline.capex} />
        <Link to="/fundamentals" search={{ range: "5y", company: "CRWV" }} className="more">
          Fundamentals →
        </Link>
      </section>

      {headline.other.length > 0 && (
        <section className="panel">
          <h2>Market & infrastructure</h2>
          <SeriesStats series={headline.other} />
        </section>
      )}

      <div className="section-head">
        <div>
          <h1>Divergence watch</h1>
          <p>
            Pairs where one series deteriorating while the other keeps rising would be a warning.
            Each series is on its own axis. Analytical observations, not claims of causation.
          </p>
        </div>
      </div>
      <div className="grid-2">
        {divergences.map((d) => (
          <section key={d.id} className="block">
            <div className="block-head">
              <h3>{d.title}</h3>
              <InfoTip label={d.title} info={DIVERGENCE_INFO[d.id] ?? EXPLAINERS.infraGeneric} />
              <span className="muted">Watch for: {d.pattern}</span>
            </div>
            {d.awaiting ? (
              <div className="no-data">
                <b>Awaiting data</b>
                <span>{d.awaiting}</span>
              </div>
            ) : (
              <DivergenceChart lines={d.lines} />
            )}
            {d.note && <p className="muted small">{d.note}</p>}
          </section>
        ))}
      </div>
    </>
  );
}

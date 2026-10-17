import { createFileRoute } from "@tanstack/react-router";
import { SectionHeader } from "~/components/SectionHeader";
import { formatDate, formatValue } from "~/lib/format";
import { getStatusData } from "~/server/data";

export const Route = createFileRoute("/alerts")({
  loader: () => getStatusData(),
  component: AlertsPage,
});

function AlertsPage() {
  const { alerts } = Route.useLoaderData();
  return (
    <>
      <SectionHeader
        title="Alerts"
        blurb="Transparent threshold rules from data/alerts.config.yaml. Each event lists the exact observations that triggered it. These are analytical flags, not predictions."
      />
      {alerts.length === 0 ? (
        <div className="no-data">
          <b>No alerts have fired</b>
          <span>Rules are evaluated after every collection run.</span>
        </div>
      ) : (
        <div className="alert-list">
          {alerts.map((a) => (
            <article key={a.id} className={`alert sev-${a.severity}`}>
              <header>
                <span className="badge">{a.severity}</span>
                <code>{a.ruleId}</code>
                <span className="muted">{formatDate(a.triggeredAt)}</span>
              </header>
              <p>{a.message}</p>
              <table className="stats">
                <thead>
                  <tr>
                    <th>Observation</th>
                    <th>Period</th>
                    <th className="num">Value</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {a.evidence.observations.map((o) => (
                    <tr key={`${o.id}-${o.seriesId}`}>
                      <td>{o.label}</td>
                      <td className="muted">{formatDate(o.periodEnd)}</td>
                      <td className="num strong">{formatValue(o.value, o.unit)}</td>
                      <td>
                        <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {o.source} ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

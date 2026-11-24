import { createFileRoute } from "@tanstack/react-router";
import { Chapter, type ChapterDef, ChapterHeader } from "~/components/Chapters";
import { ExternalLink } from "~/components/ExternalLink";
import { PageIntro } from "~/components/PageIntro";
import { SignalDot } from "~/components/SignalDot";
import type { Stat } from "~/components/StatList";
import type { Signal } from "~/domain/chapterSignals";
import { formatDate, formatValue } from "~/lib/format";
import { pageHead } from "~/lib/seo";
import { getAlertsData } from "~/server/data";

export const Route = createFileRoute("/alerts")({
  head: () =>
    pageHead(
      "/alerts",
      "Alerts",
      "See which threshold rules have fired on the AI infrastructure data, with the evidence and the thresholds behind each.",
    ),
  loader: () => getAlertsData(),
  component: AlertsPage,
});

type Severity = "critical" | "warning" | "info";

// Same colours as the homepage "Current read": critical is red, warning
// orange, info neutral. The word is always shown beside the dot.
const SEVERITY: Record<Severity, { label: string; signal: Signal }> = {
  critical: { label: "Critical", signal: "worsening" },
  warning: { label: "Warning", signal: "mixed" },
  info: { label: "Info", signal: "context" },
};

const history: ChapterDef = { slug: "history", label: "History", sub: "", signal: "context" };
const rulesCh: ChapterDef = { slug: "rules", label: "Rules", sub: "", signal: "context" };

const ISO_DAY = /\b\d{4}-\d{2}-\d{2}\b/g;

// The stored message is "<what moved>. <rule description>". The description
// is shown on its own as the headline, so the rest is the specific detail,
// with its dates in the same day style as everywhere else.
function detailOf(message: string, description: string) {
  const rest = message.endsWith(description) ? message.slice(0, -description.length) : message;
  return rest.trim().replace(ISO_DAY, formatDate);
}

function AlertsPage() {
  const { alerts, limit, rules } = Route.useLoaderData();
  const count = (s: Severity) => alerts.filter((a) => a.severity === s).length;
  const dates = alerts.map((a) => a.triggeredAt).sort();
  const first = dates[0];
  const last = dates.at(-1);
  const stats: Stat[] = [
    {
      label: "Alerts in history",
      value: String(alerts.length),
      note:
        first && last
          ? `${count("critical")} critical · ${count("warning")} warning · ${count("info")} info · ${formatDate(first)} – ${formatDate(last)}`
          : "No alert has fired",
    },
  ];

  return (
    <>
      <PageIntro eyebrow="Alerts" title="Which warning rules have fired?">
        Each alert is a simple threshold rule that fired on the collected data, listed with the
        exact observations that triggered it. They are monitoring thresholds, not validated
        predictions: read the description, then check the evidence and its source to see what
        changed.
      </PageIntro>

      <Chapter chapter={history}>
        <ChapterHeader
          index={1}
          total={2}
          chapter={history}
          question="What has fired, newest first?"
          lede={
            <>
              Each rule is also named by its id in the config, shown in grey under the evidence. The
              thresholds are listed under <a href="#rules">Rules</a>.
              {alerts.length >= limit ? ` Showing the latest ${limit} alerts.` : ""}
            </>
          }
          stats={stats}
        />
        {alerts.length === 0 ? (
          <div className="no-data">
            <b>No alerts have fired</b>
            <span>
              Rules are checked after each data collection; none has crossed its threshold in the
              stored history.
            </span>
          </div>
        ) : (
          <ol className="alert-list">
            {alerts.map((a) => {
              const sev = SEVERITY[a.severity];
              return (
                <li key={a.id} className="alert-row">
                  <div className="alert-top">
                    <SignalDot signal={sev.signal} label={sev.label} />
                    <time dateTime={a.triggeredAt} className="alert-date">
                      {formatDate(a.triggeredAt)}
                    </time>
                  </div>
                  <h3 className="alert-title">{a.description}</h3>
                  <p className="alert-detail">{detailOf(a.message, a.description)}</p>
                  <table className="stats stack-table evidence-table">
                    <thead>
                      <tr>
                        <th className="c-obs">Observation</th>
                        <th className="c-period">Period</th>
                        <th className="num c-value">Value</th>
                        <th className="c-source">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.evidence.observations.map((o, i) => (
                        // The same observation can back a breadth alert twice.
                        // biome-ignore lint/suspicious/noArrayIndexKey: rows are static.
                        <tr key={`${o.id}-${o.seriesId}-${i}`}>
                          <td className="st-title c-obs">{o.label}</td>
                          <td className="muted st-meta c-period">{formatDate(o.periodEnd)}</td>
                          <td className="num strong st-fig c-value">
                            {formatValue(o.value, o.unit)}
                          </td>
                          <td className="st-meta c-source">
                            <ExternalLink href={o.sourceUrl} arrow>
                              {o.source}
                            </ExternalLink>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="alert-rule">
                    Rule <code>{a.ruleId}</code>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </Chapter>

      <Chapter chapter={rulesCh}>
        <ChapterHeader
          index={2}
          total={2}
          chapter={rulesCh}
          question="What does each rule watch, and where is its threshold?"
          lede="Checked after each data collection. Thresholds are in the rule's own words; they are monitoring thresholds, not validated predictive signals."
        />
        <ul className="rule-list">
          {rules.map((r) => {
            const sev = SEVERITY[r.severity];
            return (
              <li key={r.id} className="rule-row">
                <SignalDot signal={sev.signal} label={sev.label} />
                <p className="rule-text">{r.description}</p>
                {r.needs ? <p className="rule-needs">{r.needs}</p> : null}
                <code className="rule-id">{r.id}</code>
              </li>
            );
          })}
        </ul>
      </Chapter>
    </>
  );
}

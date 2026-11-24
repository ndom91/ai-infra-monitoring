import { Link } from "@tanstack/react-router";
import { formatDate } from "~/lib/format";
import type { RiskRead as RiskReadData } from "~/server/overview-signals";

const DOT_LABEL = { critical: "Critical", warning: "Warning", info: "Info" } as const;

// Compact read for the homepage hero: label, detail, up to three signals.
function CompactRiskRead({ read, updated }: { read: RiskReadData; updated?: string | null }) {
  return (
    <section className="hero-read" aria-labelledby="hero-read-title">
      <div className="hero-read-top">
        <p className="hero-read-eyebrow">Current read</p>
        {updated ? <span className="hero-read-updated">Updated {formatDate(updated)}</span> : null}
      </div>
      <h2 id="hero-read-title">{read.label}</h2>
      <p className="hero-read-detail">{read.detail}</p>
      {read.signals.length > 0 ? (
        <ul className="hero-signals">
          {read.signals.slice(0, 3).map((signal) => (
            <li
              key={`${signal.ruleId}-${signal.seriesId ?? "all"}`}
              className={`sev-${signal.severity}`}
            >
              <span className="hero-signal-dot" aria-hidden="true" />
              <span className="hero-signal-sev">{DOT_LABEL[signal.severity]}</span>
              <span className="hero-signal-date">
                {formatDate(signal.triggeredAt)}
                {signal.occurrences > 1 ? ` · ${signal.occurrences} observations` : ""}
              </span>
              <span className="hero-signal-text">{signal.description ?? signal.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Link to="/alerts" className="more">
        See all alerts →
      </Link>
    </section>
  );
}

export function RiskRead({
  read,
  variant = "full",
  updated,
}: {
  read: RiskReadData;
  variant?: "full" | "compact";
  updated?: string | null;
}) {
  if (variant === "compact") return <CompactRiskRead read={read} updated={updated} />;
  return (
    <section className="risk-read" aria-labelledby="risk-read-title">
      <div className="risk-read-head">
        <div>
          <p className="eyebrow">Current read</p>
          <h2 id="risk-read-title">{read.label}</h2>
        </div>
        <p className="risk-read-detail">{read.detail}</p>
      </div>
      {read.signals.length > 0 ? (
        <ul className="risk-signal-list">
          {read.signals.slice(0, 3).map((signal) => (
            <li
              key={`${signal.ruleId}-${signal.seriesId ?? "all"}`}
              className={`sev-${signal.severity}`}
            >
              <span className="badge">{signal.severity}</span>
              <span>{signal.description ?? signal.message}</span>
              <span className="risk-signal-date">
                {formatDate(signal.triggeredAt)}
                {signal.occurrences > 1 ? ` · ${signal.occurrences} observations` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="data-timing">
        Data timing varies: credit updates daily; company filings quarterly; property data
        half-yearly. Each chart names its latest observation.
      </p>
      <Link to="/alerts" className="more">
        Review alert history →
      </Link>
    </section>
  );
}

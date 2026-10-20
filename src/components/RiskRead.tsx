import { Link } from "@tanstack/react-router";
import { formatDate } from "~/lib/format";
import type { RiskRead as RiskReadData } from "~/server/overview-signals";

export function RiskRead({ read }: { read: RiskReadData }) {
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

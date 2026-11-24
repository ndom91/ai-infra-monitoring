import { Link } from "@tanstack/react-router";
import { formatDate } from "~/lib/format";
import type { RiskRead as RiskReadData } from "~/server/overview-signals";

const DOT_LABEL = { critical: "Critical", warning: "Warning", info: "Info" } as const;

// The homepage "Current read": label, detail, up to three signals.
export function RiskRead({ read, updated }: { read: RiskReadData; updated?: string | null }) {
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

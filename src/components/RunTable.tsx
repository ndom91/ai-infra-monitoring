import { COLLECTOR_CADENCE } from "~/domain/collector-cadence";
import { RUN_STATUS, type RunStatus } from "~/domain/collector-run";
import { formatDateTime } from "~/lib/format";
import { SignalDot } from "./SignalDot";

export type Run = {
  id: number;
  collector: string;
  startedAt: string;
  status: RunStatus;
  errorClass: string | null;
  message: string | null;
  inserted: number;
  revised: number;
  unchanged: number;
};

// Collector runs, one per row. The three counts are defined where they are
// written: persist() in src/collectors/runner.ts.
export function RunTable({ runs }: { runs: Run[] }) {
  return (
    <table className="stats stack-table run-table">
      <thead>
        <tr>
          <th className="c-collector">Collector</th>
          <th className="c-status">Status</th>
          <th className="c-started">Started</th>
          <th className="c-cadence">Schedule</th>
          <th className="num c-count">New</th>
          <th className="num c-count">Revised</th>
          <th className="num c-count">Unchanged</th>
          <th className="c-message">Message</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const status = RUN_STATUS[r.status];
          const message = [r.errorClass ? `${r.errorClass}:` : "", r.message ?? ""]
            .filter(Boolean)
            .join(" ");
          return (
            <tr key={r.id}>
              <td className="st-title strong c-collector">
                <code>{r.collector}</code>
              </td>
              <td className="st-fig c-status">
                <SignalDot signal={status.signal} label={status.label} />
              </td>
              <td className="muted st-meta c-started">{formatDateTime(r.startedAt)}</td>
              <td className="muted st-meta c-cadence">
                {COLLECTOR_CADENCE[r.collector] ?? "unscheduled"}
              </td>
              <td className="num c-count">{r.inserted}</td>
              <td className="num c-count">{r.revised}</td>
              <td className="num c-count">{r.unchanged}</td>
              <td className="st-counts st-meta">
                {r.inserted} new · {r.revised} revised · {r.unchanged} unchanged
              </td>
              <td className="muted st-note c-message">{message}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

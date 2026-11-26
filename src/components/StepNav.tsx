import type { RiskRead } from "~/server/overview-signals";
import { READ_CLASS } from "./RiskRead";

export type StepTile = {
  id: string;
  verb: string;
  description: string;
  // null when the series has no data yet.
  figure: string | null;
  metric: string;
  status: RiskRead["label"];
};

// The four steps of the money trail; each tile jumps to its chapter.
export function StepNav({ steps }: { steps: StepTile[] }) {
  return (
    <nav className="step-nav" aria-label="Steps">
      {steps.map((s, i) => (
        <a key={s.id} href={`#${s.id}`} className="step-tile">
          <span className="step-top">
            <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
            {i < steps.length - 1 ? (
              <svg className="step-arrow" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M3 9h11M10 5l4 4-4 4" />
              </svg>
            ) : null}
          </span>
          <span className="step-verb">{s.verb}</span>
          <span className="step-desc">{s.description}</span>
          {s.figure == null ? (
            <span className="step-figure awaiting">Awaiting data</span>
          ) : (
            <>
              {/* Takes the step's status colour: red when Elevated, amber on Watch. */}
              <span className={`step-figure ${READ_CLASS[s.status]}`}>{s.figure}</span>
              <span className="step-metric">{s.metric}</span>
            </>
          )}
          <span className={`step-status ${READ_CLASS[s.status]}`}>
            <span className="step-status-dot" aria-hidden="true" />
            {s.status}
          </span>
        </a>
      ))}
    </nav>
  );
}

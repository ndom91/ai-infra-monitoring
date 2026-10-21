import type { ReactNode } from "react";
import type { IndicatorDef } from "~/domain/indicators";

const CLASSIFICATION_HINT: Record<IndicatorDef["classification"], string> = {
  Leading: "Early indicator of stress.",
  "Leading / coincident": "Signals stress early or as it emerges.",
  "Coincident / lagging": "Reflects stress as it happens or afterwards.",
  Mixed: "Combines early and later signs of stress.",
  Structural: "Tracks underlying conditions rather than the timing of stress.",
};

export function IndicatorPanel({ def, children }: { def: IndicatorDef; children: ReactNode }) {
  return (
    <section className="panel" id={def.id}>
      <header className="panel-head">
        <div>
          <div className="eyebrow">{def.number}</div>
          <h2>{def.title}</h2>
          <p className="measures">{def.measures}</p>
        </div>
        <span
          className={`pill cls-${def.classification.split(" ")[0]?.toLowerCase()}`}
          title={CLASSIFICATION_HINT[def.classification]}
        >
          {def.classification}
        </span>
      </header>
      {children}
      <details className="readme">
        <summary>How to read this</summary>
        <div className="readme-body">
          <div>
            <h4>Warning signs</h4>
            <p>{def.deterioration}</p>
          </div>
          <div>
            <h4>Keep in mind</h4>
            <ul>
              {def.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Sources</h4>
            <ul>
              {def.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}

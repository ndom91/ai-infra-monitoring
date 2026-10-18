import type { ReactNode } from "react";
import type { IndicatorDef } from "~/domain/indicators";

export function IndicatorPanel({ def, children }: { def: IndicatorDef; children: ReactNode }) {
  return (
    <section className="panel" id={def.id}>
      <header className="panel-head">
        <div>
          <div className="eyebrow">{def.number}</div>
          <h2>{def.title}</h2>
          <p className="measures">{def.measures}</p>
        </div>
        <span className={`pill cls-${def.classification.split(" ")[0]?.toLowerCase()}`}>
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

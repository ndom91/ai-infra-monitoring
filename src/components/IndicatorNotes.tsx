import type { IndicatorDef } from "~/domain/indicators";
import { ExternalLink } from "./ExternalLink";

// "How to read this": what an indicator measures, its warning signs,
// caveats and sources, from src/domain/indicators.ts.
export function IndicatorNotes({ def }: { def: IndicatorDef }) {
  return (
    <details className="readme indicator-notes">
      <summary>
        How to read this <span className="readme-kind">· {def.classification.toLowerCase()}</span>
      </summary>
      <p className="readme-measures">{def.measures}</p>
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
                <ExternalLink href={s.url} arrow>
                  {s.label}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

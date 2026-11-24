import { CLASSIFICATION_TIMING, type IndicatorDef } from "~/domain/indicators";
import { Disclosure } from "./Disclosure";
import { ExternalLink } from "./ExternalLink";

// "How to read this": what an indicator measures, its warning signs,
// caveats and sources, from src/domain/indicators.ts.
export function IndicatorNotes({ def }: { def: IndicatorDef }) {
  return (
    <Disclosure className="readme indicator-notes" summary="How to read this">
      <p className="readme-measures">{CLASSIFICATION_TIMING[def.classification]}</p>
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
    </Disclosure>
  );
}

import type { ReactNode } from "react";
import type { Explainer } from "~/domain/explainers";
import type { Story } from "~/domain/narrative";
import { InfoTip } from "./InfoTip";

// One headline finding: headline stating the result, chart, plain-English
// paragraphs, and a small source line. Renders a quiet placeholder when the
// data is too thin to support a headline.
export function StoryChart({
  story,
  dek,
  source,
  info,
  fallbackTitle,
  signal,
  children,
}: {
  story: Story | null;
  dek: string;
  source: string;
  info?: Explainer;
  fallbackTitle: string;
  signal: string;
  children: ReactNode;
}) {
  return (
    <figure className="story-chart">
      <div className="story-chart-head">
        <h3>{story?.headline ?? fallbackTitle}</h3>
        {info && <InfoTip label={story?.headline ?? fallbackTitle} info={info} />}
      </div>
      <p className="story-dek">{dek}</p>
      <p className="chart-signal">
        <b>Read:</b> {signal}
      </p>
      {story ? (
        children
      ) : (
        <div className="no-data">
          <b>Not enough data yet</b>
          <span>This finding appears once the monitor has enough history to compare.</span>
        </div>
      )}
      {story?.body.length ? (
        <div className="story-analysis">
          <p className="story-body">{story.body[0]}</p>
          {story.body.length > 1 ? (
            <details className="story-details">
              <summary>Evidence and context ({story.body.length - 1} notes)</summary>
              {story.body.slice(1).map((para) => (
                <p key={para} className="story-body">
                  {para}
                </p>
              ))}
            </details>
          ) : null}
        </div>
      ) : null}
      <figcaption className="story-source">{source}</figcaption>
    </figure>
  );
}

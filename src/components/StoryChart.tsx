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
  children,
}: {
  story: Story | null;
  dek: string;
  source: string;
  info?: Explainer;
  fallbackTitle: string;
  children: ReactNode;
}) {
  return (
    <figure className="story-chart">
      <div className="story-chart-head">
        <h3>{story?.headline ?? fallbackTitle}</h3>
        {info && <InfoTip label={story?.headline ?? fallbackTitle} info={info} />}
      </div>
      <p className="story-dek">{dek}</p>
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
          {story.body.map((para) => (
            <p key={para} className="story-body">
              {para}
            </p>
          ))}
        </div>
      ) : null}
      <figcaption className="story-source">{source}</figcaption>
    </figure>
  );
}

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
  // A chart, or a function of the headline for charts that need it as a name.
  children: ReactNode | ((title: string) => ReactNode);
}) {
  const title = story?.headline ?? fallbackTitle;
  return (
    // Two children, a head and a body, so charts in a row can share a head row.
    <figure className="story-chart">
      <div className="story-chart-top">
        <div className="story-chart-head">
          <h3>{title}</h3>
          {info && <InfoTip label={title} info={info} />}
        </div>
        <p className="story-dek">{dek}</p>
      </div>
      <div className="story-chart-body">
        {story ? (
          typeof children === "function" ? (
            children(title)
          ) : (
            children
          )
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
      </div>
    </figure>
  );
}

import type { ReactNode } from "react";
import type { RangeKey } from "~/domain/ranges";
import { RangeToolbar } from "./RangeToolbar";

// Page head for the chapter and scorecard pages: eyebrow, question, one
// paragraph, and the range toolbar when the page has a range.
export function PageIntro({
  eyebrow,
  title,
  range,
  children,
}: {
  eyebrow: string;
  title: string;
  range?: RangeKey;
  children: ReactNode;
}) {
  return (
    <header className="page-intro">
      <div className="page-intro-text">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-intro-lead">{children}</p>
      </div>
      {range ? <RangeToolbar active={range} /> : null}
    </header>
  );
}

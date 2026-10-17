import type { RangeKey } from "~/domain/ranges";
import { RangeToolbar } from "./RangeToolbar";

export function SectionHeader({
  title,
  blurb,
  range,
}: {
  title: string;
  blurb: string;
  range?: RangeKey;
}) {
  return (
    <div className="section-head">
      <div>
        <h1>{title}</h1>
        <p>{blurb}</p>
      </div>
      {range && <RangeToolbar active={range} />}
    </div>
  );
}

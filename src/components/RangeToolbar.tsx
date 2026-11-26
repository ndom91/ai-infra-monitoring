import { Link } from "@tanstack/react-router";
import { RANGE_KEYS, RANGES, type RangeKey } from "~/domain/ranges";
import { useSlidingIndicator } from "./useSlidingIndicator";

export function RangeToolbar({ active }: { active: RangeKey }) {
  const { bar, indicator } = useSlidingIndicator<HTMLElement>(active);
  return (
    <nav ref={bar} className="toolbar" aria-label="Time range">
      <span ref={indicator} className="t-ind" aria-hidden="true" />
      {RANGE_KEYS.map((k) => (
        <Link
          key={k}
          to="."
          // Default params are stripped from URLs; without `exact` every link would match as active.
          activeOptions={{ exact: true }}
          search={(prev: Record<string, unknown>) => ({ ...prev, range: k })}
          aria-current={k === active ? "true" : undefined}
          className="toolbar-btn"
          // Reserves the bold width; see .toolbar-btn::after.
          data-label={RANGES[k].label}
        >
          {RANGES[k].label}
        </Link>
      ))}
    </nav>
  );
}

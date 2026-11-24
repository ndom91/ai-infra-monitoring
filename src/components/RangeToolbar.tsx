import { Link } from "@tanstack/react-router";
import { RANGE_KEYS, RANGES, type RangeKey } from "~/domain/ranges";

export function RangeToolbar({ active }: { active: RangeKey }) {
  return (
    <nav className="toolbar" aria-label="Time range">
      {RANGE_KEYS.map((k) => (
        <Link
          key={k}
          to="."
          // Default params are stripped from URLs; without `exact` every link would match as active.
          activeOptions={{ exact: true }}
          search={(prev: Record<string, unknown>) => ({ ...prev, range: k })}
          aria-current={k === active ? "true" : undefined}
          className="toolbar-btn"
        >
          {RANGES[k].label}
        </Link>
      ))}
    </nav>
  );
}

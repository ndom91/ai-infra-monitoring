import { Link } from "@tanstack/react-router";
import { RANGE_KEYS, RANGES, type RangeKey } from "~/domain/ranges";

export function RangeToolbar({ active }: { active: RangeKey }) {
  return (
    <nav className="toolbar" aria-label="Time range">
      {RANGE_KEYS.map((k) => (
        <Link
          key={k}
          to="."
          search={(prev: Record<string, unknown>) => ({ ...prev, range: k })}
          aria-pressed={k === active}
          className="toolbar-btn"
        >
          {RANGES[k].label}
        </Link>
      ))}
    </nav>
  );
}

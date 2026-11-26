import { freshnessSuffix } from "~/domain/freshness";
import { formatDate, formatDelta, formatValue } from "~/lib/format";
import type { SeriesView } from "~/server/data";

export type Stat = {
  label: string;
  // null when the figure cannot be computed from stored data.
  value: string | null;
  // Period, change, and "calculated" where it applies.
  note: string;
  // Shown instead of "Awaiting data" when the value is null for a known
  // reason, e.g. "Not tracked".
  placeholder?: string;
};

export function StatList({ stats }: { stats: Stat[] }) {
  return (
    <dl className="stat-list">
      {stats.map((s) => (
        <div key={s.label} className="stat-row">
          <dt className="stat-label">{s.label}</dt>
          <dd className={`stat-value${s.value == null ? " awaiting" : ""}`}>
            {s.value ?? s.placeholder ?? "Awaiting data"}
          </dd>
          <dd className="stat-note">{s.note}</dd>
        </div>
      ))}
    </dl>
  );
}

// Marks a figure whose series is not current, so stale data never passes as today's.
export const freshnessNote = (s: Pick<SeriesView, "freshness">) => freshnessSuffix(s.freshness);

// Latest value, its date, and the change over a year. `bps` shows spreads
// and yields in basis points.
export function latestChangeStat(
  label: string,
  s: SeriesView | undefined,
  opts: { bps?: boolean } = {},
): Stat {
  if (!s?.latest) return { label, value: null, note: "No data collected yet" };
  const y1 = s.changes?.y1;
  let change = "no value a year earlier";
  if (y1) {
    change =
      y1.delta === 0 ? "unchanged in a year" : `${formatDelta(y1, s.unit, opts.bps)} in a year`;
  }
  return {
    label,
    value: formatValue(s.latest.value, s.unit),
    note: `${formatDate(s.latest.periodEnd)} · ${change}${freshnessNote(s)}`,
  };
}

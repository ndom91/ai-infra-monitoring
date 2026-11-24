import type { Signal } from "~/domain/chapterSignals";

export type Stat = {
  label: string;
  // null when the figure cannot be computed from stored data.
  value: string | null;
  // Period, change, and "calculated" where it applies.
  note: string;
  tone?: Signal;
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
          <dd
            className={`stat-value${s.tone ? ` tone-${s.tone}` : ""}${
              s.value == null ? " awaiting" : ""
            }`}
          >
            {s.value ?? s.placeholder ?? "Awaiting data"}
          </dd>
          <dd className="stat-note">{s.note}</dd>
        </div>
      ))}
    </dl>
  );
}

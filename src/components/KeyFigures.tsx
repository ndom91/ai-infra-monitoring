export type KeyFigure = {
  label: string;
  value: string;
  note: string;
  // Fractional change over a year; null when no comparable point exists.
  change: number | null;
};

const FLAT = 0.005;

function Change({ change }: { change: number | null }) {
  if (change == null) {
    return <span className="kf-change flat">n/a</span>;
  }
  const dir = Math.abs(change) < FLAT ? "flat" : change > 0 ? "up" : "down";
  return (
    <span className={`kf-change ${dir}`}>
      <span className="kf-arrow" aria-hidden="true">
        {dir === "up" ? "▲" : dir === "down" ? "▼" : "▬"}
      </span>
      <span className="kf-pct">
        {dir === "flat" ? "0%" : `${change > 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(0)}%`}
      </span>
      <span className="kf-period">1 year</span>
    </span>
  );
}

export function KeyFigures({ items }: { items: KeyFigure[] }) {
  return (
    <div className="key-figures">
      {items.map((k) => (
        <div key={k.label} className="key-figure">
          <div className="kf-main">
            <span className="kf-label">{k.label}</span>
            <span className="kf-value">{k.value}</span>
            <span className="kf-note">{k.note}</span>
          </div>
          <Change change={k.change} />
        </div>
      ))}
    </div>
  );
}

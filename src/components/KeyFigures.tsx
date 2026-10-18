export type KeyFigure = { label: string; value: string; note: string };

export function KeyFigures({ items }: { items: KeyFigure[] }) {
  return (
    <div className="key-figures">
      {items.map((k) => (
        <div key={k.label} className="key-figure">
          <span className="kf-label">{k.label}</span>
          <span className="kf-value">{k.value}</span>
          <span className="kf-note">{k.note}</span>
        </div>
      ))}
    </div>
  );
}

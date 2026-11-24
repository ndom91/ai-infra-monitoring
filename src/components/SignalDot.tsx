import { SIGNAL_LABELS, type Signal } from "~/domain/chapterSignals";

// A 6 px dot plus a small uppercase label. With `labelHidden` the label is
// kept for screen readers only, for compact lists that sit next to a legend.
// `label` replaces the default wording where the colour means something else,
// such as a run status.
export function SignalDot({
  signal,
  labelHidden,
  label = SIGNAL_LABELS[signal],
}: {
  signal: Signal;
  labelHidden?: boolean;
  label?: string;
}) {
  return (
    <span className={`signal sig-${signal}`} title={label}>
      <span className="signal-dot" aria-hidden="true" />
      <span className={labelHidden ? "sr-only" : "signal-label"}>{label}</span>
    </span>
  );
}

export function SignalLegend({ signals }: { signals: Signal[] }) {
  return (
    <ul className="signal-legend" aria-label="Status key">
      {signals.map((s) => (
        <li key={s}>
          <span className={`signal sig-${s}`}>
            <span className="signal-dot" aria-hidden="true" />
          </span>
          {SIGNAL_LABELS[s]}
        </li>
      ))}
    </ul>
  );
}

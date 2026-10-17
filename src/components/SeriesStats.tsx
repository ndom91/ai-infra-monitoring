import { formatDate, formatDelta, formatValue } from "~/lib/format";
import type { Change } from "~/metrics/changes";
import type { SeriesView } from "~/server/data";
import { FreshnessBadge } from "./FreshnessBadge";

const HIGH_FREQUENCY = new Set(["daily", "weekdays", "weekly", "monthly"]);

export function SeriesStats({ series }: { series: SeriesView[] }) {
  return (
    <table className="stats">
      <thead>
        <tr>
          <th>Series</th>
          <th className="num">Latest</th>
          <th>Observed</th>
          <th className="num">Change</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {series.map((s) => (
          <SeriesRow key={s.id} s={s} />
        ))}
      </tbody>
    </table>
  );
}

function SeriesRow({ s }: { s: SeriesView }) {
  const bps = s.collector === "fred";
  // Daily data gets fixed windows; quarterly/semiannual data compares to the
  // prior report and the same period a year earlier, never to daily windows.
  const deltas: [string, Change | null][] = HIGH_FREQUENCY.has(s.cadence)
    ? [
        ["3M", s.changes.m3],
        ["6M", s.changes.m6],
        ["1Y", s.changes.y1],
      ]
    : [
        ["Prior", s.changes.prior],
        ["YoY", s.changes.y1],
      ];
  return (
    <tr>
      <td>
        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer" title={s.methodology}>
          {s.label}
        </a>
        {s.latest && s.latest.kind !== "reported" && <span className="kind">{s.latest.kind}</span>}
      </td>
      <td className="num strong">{s.latest ? formatValue(s.latest.value, s.unit) : "—"}</td>
      <td className="muted">
        {s.latest ? (
          <a
            href={s.latest.sourceUrl ?? s.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={[s.latest.quote && `“${s.latest.quote}”`, s.latest.note]
              .filter(Boolean)
              .join("\n\n")}
          >
            {formatDate(s.latest.periodEnd)}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td className="num deltas">
        {deltas.map(([label, c]) =>
          c ? (
            <span
              key={label}
              title={`vs ${formatDate(c.from.periodEnd)}: ${formatValue(c.from.value, s.unit)}`}
            >
              <em>{label}</em> {formatDelta(c, s.unit, bps)}
            </span>
          ) : null,
        )}
      </td>
      <td>
        <FreshnessBadge state={s.freshness} />
      </td>
    </tr>
  );
}

import { formatDate, formatDelta, formatPeriod, formatValue } from "~/lib/format";
import type { Change } from "~/metrics/changes";
import type { SeriesView } from "~/server/data";
import { ExternalLink } from "./ExternalLink";
import { FreshnessBadge } from "./FreshnessBadge";
import { ProvenanceTip } from "./ProvenanceTip";

const HIGH_FREQUENCY = new Set(["daily", "weekdays", "weekly", "monthly"]);

export function SeriesStats({ series }: { series: SeriesView[] }) {
  return (
    <table className="stats series-stats">
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
        ["3M", s.changes?.m3 ?? null],
        ["6M", s.changes?.m6 ?? null],
        ["1Y", s.changes?.y1 ?? null],
      ]
    : [
        ["Prior", s.changes?.prior ?? null],
        ["YoY", s.changes?.y1 ?? null],
      ];
  // The base of each change figure, for the row's popover.
  const changeLines = deltas.flatMap(([label, c]) =>
    c ? [`${label} vs ${formatDate(c.from.periodEnd)}: ${formatValue(c.from.value, s.unit)}`] : [],
  );
  // A period still running shows its name, not an end date in the future.
  const observed = s.latest
    ? s.inProgress
      ? `${formatPeriod(s.latest.periodEnd, s.cadence)} · in progress`
      : formatDate(s.latest.periodEnd)
    : "";
  return (
    <tr>
      <td className="c-series">
        <ExternalLink href={s.sourceUrl}>{s.label}</ExternalLink>
        {s.latest?.kind && <span className="kind">{s.latest.kind}</span>}
      </td>
      <td className="num strong c-latest">
        {s.latest ? formatValue(s.latest.value, s.unit) : "—"}
      </td>
      <td className="muted c-observed">
        {s.latest ? (
          <>
            <ExternalLink
              href={s.latest.sourceUrl ?? s.sourceUrl}
              context={`source for ${s.label}`}
            >
              {observed}
            </ExternalLink>
            <ProvenanceTip
              series={s.label}
              date={observed}
              methodology={s.methodology}
              quote={s.latest.quote}
              note={s.latest.note}
              sourceUrl={s.latest.sourceUrl ?? s.sourceUrl}
              changes={changeLines}
            />
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="num deltas c-change">
        {deltas.map(([label, c]) =>
          c ? (
            <span key={label}>
              <em>{label}</em> {formatDelta(c, s.unit, bps)}
            </span>
          ) : null,
        )}
      </td>
      <td className="c-status">
        <FreshnessBadge state={s.freshness} />
      </td>
    </tr>
  );
}

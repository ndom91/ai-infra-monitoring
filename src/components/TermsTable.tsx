import { formatDate, formatValue } from "~/lib/format";
import type { SeriesView } from "~/server/data";

// One-off disclosed figures (debt issue terms, contract announcements) are
// events, not time series, so they are listed rather than charted.
export function TermsTable({
  title,
  subtitle,
  series,
  labelOf = (s) => s.label,
}: {
  title: string;
  subtitle?: string;
  series: SeriesView[];
  labelOf?: (s: SeriesView) => string;
}) {
  // Always include each series' latest entry: a one-off term (e.g. a 2023
  // note issue) should not vanish because the page range is shorter.
  const rows = series
    .flatMap((s) => {
      const pts = s.points.slice();
      if (s.latest && !pts.some((p) => p.periodEnd === s.latest?.periodEnd)) pts.push(s.latest);
      return pts.map((p) => ({ s, p }));
    })
    .sort((a, b) => b.p.periodEnd.localeCompare(a.p.periodEnd));
  return (
    <div className="block">
      <div className="block-head">
        <h3>{title}</h3>
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>
      {rows.length === 0 ? (
        <div className="no-data">
          <b>No entries in the selected range</b>
          <span>Try a longer range.</span>
        </div>
      ) : (
        <table className="stats">
          <thead>
            <tr>
              <th>Issuer</th>
              <th>Item</th>
              <th className="num">Value</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, p }) => (
              <tr key={`${s.id}-${p.periodEnd}`}>
                <td className="strong">{s.entity}</td>
                <td title={s.methodology}>{labelOf(s)}</td>
                <td className="num strong">{formatValue(p.value, s.unit)}</td>
                <td className="muted">
                  <a
                    href={p.sourceUrl ?? s.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={[p.quote && `“${p.quote}”`, p.note].filter(Boolean).join("\n\n")}
                  >
                    {formatDate(p.periodEnd)} ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

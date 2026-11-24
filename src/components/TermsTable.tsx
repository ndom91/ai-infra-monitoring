import type { Explainer } from "~/domain/explainers";
import { formatDate, formatValue } from "~/lib/format";
import type { SeriesView } from "~/server/data";
import { ExternalLink } from "./ExternalLink";
import { InfoTip } from "./InfoTip";
import { ProvenanceTip } from "./ProvenanceTip";

// One-off disclosed figures (debt issue terms, contract announcements) are
// events, not time series, so they are listed rather than charted.
type Row = { s: SeriesView; p: SeriesView["points"][number] };

export function TermsTable({
  title,
  subtitle,
  series,
  labelOf = (s) => s.label,
  info,
  emptyReason,
  hideIssuer,
  visibleRows,
}: {
  title: string;
  subtitle?: string;
  series: SeriesView[];
  labelOf?: (s: SeriesView) => string;
  info?: Explainer;
  // Shown when there are no series at all, rather than none in range.
  emptyReason?: string;
  // For a table of one borrower, where the issuer repeats on every row.
  hideIssuer?: boolean;
  // Rows past this count sit in a disclosure. They stay in the page, so
  // find-in-page still reaches them.
  visibleRows?: number;
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
  const split = visibleRows !== undefined && rows.length > visibleRows;
  const shown = split ? rows.slice(0, visibleRows) : rows;
  const rest = split ? rows.slice(visibleRows) : [];
  return (
    // Two children, a head and a body, so charts in a row can share a head row.
    <div className="block">
      <div className="block-head">
        <h3>{title}</h3>
        {info && <InfoTip label={title} info={info} />}
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>
      <div className="block-body">
        {rows.length === 0 ? (
          <div className="no-data">
            {series.some((s) => s.latest) ? (
              <>
                <b>No observations in the selected range</b>
                <span>Try a longer range.</span>
              </>
            ) : (
              <>
                <b>No data collected yet</b>
                {emptyReason && <span>{emptyReason}</span>}
              </>
            )}
          </div>
        ) : (
          <>
            <RateTable rows={shown} labelOf={labelOf} hideIssuer={hideIssuer} split={split} />
            {rest.length > 0 && (
              <details className="chapter-more">
                <summary>Show all {rows.length} rates</summary>
                <RateTable rows={rest} labelOf={labelOf} hideIssuer={hideIssuer} split headless />
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RateTable({
  rows,
  labelOf,
  hideIssuer,
  split,
  headless,
}: {
  rows: Row[];
  labelOf: (s: SeriesView) => string;
  hideIssuer?: boolean;
  // Fixed columns, so a table cut in two keeps its columns aligned.
  split?: boolean;
  headless?: boolean;
}) {
  return (
    <table
      className={`stats stack-table terms-table${split ? " terms-split" : ""}${hideIssuer ? " no-issuer" : ""}`}
    >
      <thead className={headless ? "sr-only" : undefined}>
        <tr>
          {hideIssuer ? null : <th className="c-issuer">Issuer</th>}
          <th className="c-item">Item</th>
          <th className="num c-value">Value</th>
          <th className="c-date">Date</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ s, p }) => (
          <tr key={`${s.id}-${p.periodEnd}`}>
            {hideIssuer ? null : <td className="strong st-meta c-issuer">{s.entity}</td>}
            <td className="st-title c-item">{labelOf(s)}</td>
            <td className="num strong st-fig c-value">{formatValue(p.value, s.unit)}</td>
            <td className="muted st-meta c-date">
              <ExternalLink
                href={p.sourceUrl ?? s.sourceUrl}
                arrow
                context={`source for ${labelOf(s)}`}
              >
                {formatDate(p.periodEnd)}
              </ExternalLink>
              <ProvenanceTip
                series={labelOf(s)}
                date={formatDate(p.periodEnd)}
                methodology={s.methodology}
                quote={p.quote}
                note={p.note}
                sourceUrl={p.sourceUrl ?? s.sourceUrl}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

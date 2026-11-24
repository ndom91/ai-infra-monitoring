import { formatIssuedRate, ISSUED_KIND_LABELS, type IssuedInstrument } from "~/domain/headlines";
import { formatMonthYear } from "~/lib/format";

// Debt deals at issue. Below 640 px each row stacks: title, a muted meta
// line, and the rate on the right (see .stack-table).
export function IssuedTable({ rows, caption }: { rows: IssuedInstrument[]; caption: string }) {
  return (
    <table className="stats stack-table issued-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th>Instrument</th>
          <th>Issuer</th>
          <th>Type</th>
          <th>Issued</th>
          <th className="num">Rate at issue</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="st-title">
              <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
                {r.title}
              </a>
            </td>
            <td className="st-meta">{r.issuer}</td>
            <td className="st-meta">{ISSUED_KIND_LABELS[r.kind]}</td>
            <td className="st-meta">{formatMonthYear(r.issued)}</td>
            <td className="num strong st-fig">{formatIssuedRate(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

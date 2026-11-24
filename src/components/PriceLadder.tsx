import type { LadderRow } from "~/domain/market";
import { formatDate } from "~/lib/format";
import { ExternalLink } from "./ExternalLink";
import { FreshnessBadge } from "./FreshnessBadge";

// Sellers of one chip, cheapest first. The bar is decorative: its width is
// the price as a share of the dearest price; the text carries the value.
export function PriceLadder({ title, rows }: { title: string; rows: LadderRow[] }) {
  const dearest = rows.at(-1)?.price ?? 0;
  const dates = new Set(rows.map((r) => r.observed));
  const sharedDate = dates.size === 1 ? rows[0]?.observed : undefined;
  return (
    <div className="block price-ladder">
      <div className="block-head">
        <h3>{title}</h3>
        <span className="muted">
          Latest price per GPU-hour{sharedDate ? ` · ${formatDate(sharedDate)}` : ""}
        </span>
      </div>
      <div className="block-body">
        {rows.length === 0 ? (
          <div className="no-data">
            <b>No series collected yet</b>
            <span>No price data collected yet.</span>
          </div>
        ) : (
          <table className="ladder">
            <caption className="sr-only">{title}</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Offer</th>
                <th scope="col">Relative price</th>
                <th scope="col">Price per GPU-hour</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <th scope="row" className="ladder-offer">
                    <ExternalLink href={r.sourceUrl}>{r.label}</ExternalLink>
                    <span className="ladder-meta">
                      {r.region}
                      {r.kind && r.kind !== "reported" ? (
                        <span className="kind">{r.kind}</span>
                      ) : null}
                      {r.freshness !== "current" ? <FreshnessBadge state={r.freshness} /> : null}
                      {sharedDate ? null : <span> · {formatDate(r.observed)}</span>}
                    </span>
                  </th>
                  <td className="ladder-bar-cell">
                    <span className="ladder-track" aria-hidden="true">
                      <span
                        className={`ladder-bar${i === 0 ? " cheapest" : ""}`}
                        style={{ width: `${dearest > 0 ? (r.price / dearest) * 100 : 0}%` }}
                      />
                    </span>
                  </td>
                  <td className="ladder-price">${r.price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { formatDate } from "~/lib/format";
import type { FilingEventRow } from "~/storage/queries";

export function FilingEvents({ events }: { events: FilingEventRow[] }) {
  return (
    <section className="panel">
      <h2>Latest SEC filings</h2>
      <p className="measures">
        Filing events arrive before quarterly figures are available. Read the source filing; this is
        not an automated interpretation of its contents.
      </p>
      {events.length === 0 ? (
        <div className="no-data">
          <b>No filing events collected yet</b>
          <span>The SEC filings collector runs several times each weekday.</span>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="stats">
            <thead>
              <tr>
                <th>Company</th>
                <th>Form</th>
                <th>Description</th>
                <th>Filed</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.accession}>
                  <td className="strong">{event.ticker}</td>
                  <td>
                    <code>{event.form}</code>
                  </td>
                  <td className="muted">{event.description ?? event.items ?? "SEC filing"}</td>
                  <td className="muted">
                    <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer">
                      {formatDate(event.filedAt)} ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

import { formatDate } from "~/lib/format";
import type { FilingEventRow } from "~/storage/queries";
import { ExternalLink } from "./ExternalLink";

export function FilingEvents({ events }: { events: FilingEventRow[] }) {
  return (
    <div className="block">
      <div className="block-head">
        <h3>Latest SEC filings</h3>
        <span className="muted">
          Filing events arrive before quarterly figures are available. Read the source filing; this
          is not an automated interpretation of its contents.
        </span>
      </div>
      <div className="block-body">
        {events.length === 0 ? (
          <div className="no-data">
            <b>No data collected yet</b>
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
                      <ExternalLink
                        href={event.sourceUrl}
                        arrow
                        context={`${event.ticker} ${event.form} filing`}
                      >
                        {formatDate(event.filedAt)}
                      </ExternalLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

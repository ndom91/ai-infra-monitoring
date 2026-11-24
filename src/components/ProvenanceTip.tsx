import { ExternalLink } from "./ExternalLink";
import { InfoTip } from "./InfoTip";

// What a table row cannot show inline: how the series is measured, the quote
// that backs a hand-entered value, and what each change is measured against.
// Renders nothing when there is nothing to show.
export function ProvenanceTip({
  series,
  date,
  methodology,
  quote,
  note: rawNote,
  sourceUrl,
  changes = [],
}: {
  series: string;
  date: string;
  methodology?: string;
  quote?: string | null;
  note?: string | null;
  sourceUrl: string;
  // One line per change figure, e.g. "3M vs 20 Aug 2026: 4.10%".
  changes?: string[];
}) {
  // Calculated figures repeat their methodology as the note; show it once.
  const note = rawNote && rawNote !== methodology ? rawNote : null;
  const hasQuote = Boolean(quote || note);
  if (!hasQuote && !methodology && changes.length === 0) return null;
  const parts = [
    hasQuote && (quote ? "Source quote" : "Note"),
    methodology && "method",
    changes.length > 0 && "changes",
  ].filter(Boolean) as string[];
  const [first = "", ...more] = parts;
  const list = more.length ? `${first}, ${more.join(" and ")}` : first;
  const name = `${list.charAt(0).toUpperCase()}${list.slice(1)} for ${series}, ${date}`;
  return (
    <InfoTip
      inline
      label={series}
      ariaLabel={name}
      text={quote ? "quote" : note ? "note" : "method"}
    >
      {hasQuote ? (
        <span className="infotip-row">
          <b>{quote ? "Source quote" : "Note"}</b>
          {quote ? <q className="infotip-quote">{quote}</q> : null}
          {note ? <span className="infotip-note">{note}</span> : null}
        </span>
      ) : null}
      {hasQuote ? (
        <span className="infotip-row infotip-source">
          <ExternalLink href={sourceUrl} arrow>
            Source
          </ExternalLink>
        </span>
      ) : null}
      {methodology ? (
        <span className="infotip-row">
          <b>How this is measured</b>
          {methodology}
        </span>
      ) : null}
      {changes.length > 0 ? (
        <span className="infotip-row">
          <b>Changes</b>
          {changes.map((c) => (
            <span key={c} className="infotip-line">
              {c}
            </span>
          ))}
        </span>
      ) : null}
    </InfoTip>
  );
}

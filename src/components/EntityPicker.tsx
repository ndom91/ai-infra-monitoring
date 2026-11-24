import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import { COMPANY_GROUP_LABELS, type CompanyGroup, type SecCompany } from "~/domain/companies";

function Chip({ company, active }: { company: SecCompany; active: boolean }) {
  return (
    <Link
      to="."
      search={(prev: Record<string, unknown>) => ({ ...prev, company: company.ticker })}
      hash={(prev) => prev ?? ""}
      // Switching company should not jump back to the top of the page.
      resetScroll={false}
      aria-current={active ? "true" : undefined}
      // The name starts with the visible ticker.
      aria-label={`${company.ticker}, ${company.name}`}
      title={company.name}
      className="chip"
    >
      {company.ticker}
    </Link>
  );
}

// Ticker chips grouped by company group (rail), or one swipeable row (phones).
export function EntityPicker({
  companies,
  active,
  variant,
  label,
}: {
  companies: SecCompany[];
  active: string;
  variant: "rail" | "row";
  label: string;
}) {
  const groups = (Object.keys(COMPANY_GROUP_LABELS) as CompanyGroup[]).filter((g) =>
    companies.some((c) => c.group === g),
  );
  if (variant === "row") {
    // The rail's group headings, kept as small labels inside the scrolling row.
    return (
      <nav className="chip-row" aria-label={label}>
        {groups.map((g) => (
          <Fragment key={g}>
            <span className="chip-group-label">{COMPANY_GROUP_LABELS[g]}</span>
            {companies
              .filter((c) => c.group === g)
              .map((c) => (
                <Chip key={c.ticker} company={c} active={c.ticker === active} />
              ))}
          </Fragment>
        ))}
      </nav>
    );
  }
  return (
    <nav className="chip-groups" aria-label={label}>
      {groups.map((g) => (
        <div key={g} className="chip-group">
          <span className="chip-group-label">{COMPANY_GROUP_LABELS[g]}</span>
          <div className="chips">
            {companies
              .filter((c) => c.group === g)
              .map((c) => (
                <Chip key={c.ticker} company={c} active={c.ticker === active} />
              ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function EntityBand({
  eyebrow,
  company,
  blurb,
  switches,
  link,
}: {
  eyebrow: string;
  company: Pick<SecCompany, "name" | "ticker">;
  blurb: string;
  // What the picker switches ("company", "borrower"), for the hint after the blurb.
  switches: string;
  link: ReactNode;
}) {
  return (
    <div className="entity-band">
      <div>
        <p className="entity-band-eyebrow">{eyebrow}</p>
        <p className="entity-band-name">
          {company.name} <span className="ticker">{company.ticker}</span>
        </p>
        <p className="entity-band-blurb">
          {blurb} {/* The rail exists on desktop only; phones get a row of chips below. */}
          <span className="hint-rail">Switch {switches} in the side rail.</span>
          <span className="hint-row">Switch {switches} in the row below.</span>
        </p>
      </div>
      <div className="entity-band-link">{link}</div>
    </div>
  );
}

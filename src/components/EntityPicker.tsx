import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { COMPANY_GROUP_LABELS, type CompanyGroup, type SecCompany } from "~/domain/companies";

function Chip({ company, active }: { company: SecCompany; active: boolean }) {
  return (
    <Link
      to="."
      search={(prev: Record<string, unknown>) => ({ ...prev, company: company.ticker })}
      hash={(prev) => prev ?? ""}
      // Switching company should not jump back to the top of the page.
      resetScroll={false}
      aria-pressed={active}
      aria-label={company.name}
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
  if (variant === "row") {
    return (
      <nav className="chip-row" aria-label={label}>
        {companies.map((c) => (
          <Chip key={c.ticker} company={c} active={c.ticker === active} />
        ))}
      </nav>
    );
  }
  const groups = (Object.keys(COMPANY_GROUP_LABELS) as CompanyGroup[]).filter((g) =>
    companies.some((c) => c.group === g),
  );
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
  link,
}: {
  eyebrow: string;
  company: Pick<SecCompany, "name" | "ticker">;
  blurb: string;
  link: ReactNode;
}) {
  return (
    <div className="entity-band">
      <div>
        <p className="entity-band-eyebrow">{eyebrow}</p>
        <p className="entity-band-name">
          {company.name} <span className="ticker">{company.ticker}</span>
        </p>
        <p className="entity-band-blurb">{blurb}</p>
      </div>
      <div className="entity-band-link">{link}</div>
    </div>
  );
}

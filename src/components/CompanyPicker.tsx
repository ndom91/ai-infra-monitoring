import { Link } from "@tanstack/react-router";
import { COMPANY_GROUP_LABELS, type CompanyGroup, SEC_COMPANIES } from "~/domain/companies";

export function CompanyPicker({ active }: { active: string }) {
  return (
    <nav className="toolbar picker" aria-label="Company">
      {(Object.keys(COMPANY_GROUP_LABELS) as CompanyGroup[]).map((group) => (
        <div key={group} className="picker-group">
          <span className="picker-label">{COMPANY_GROUP_LABELS[group]}</span>
          <div className="picker-options">
            {SEC_COMPANIES.filter((c) => c.group === group).map((c) => (
              <Link
                key={c.ticker}
                to="."
                search={(prev: Record<string, unknown>) => ({ ...prev, company: c.ticker })}
                // Switching company should not jump back to the top of the page.
                resetScroll={false}
                aria-pressed={c.ticker === active}
                className="toolbar-btn"
              >
                {c.ticker}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

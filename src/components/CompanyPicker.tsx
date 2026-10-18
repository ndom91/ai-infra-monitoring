import { Link } from "@tanstack/react-router";
import { SEC_COMPANIES } from "~/domain/companies";

export function CompanyPicker({ active }: { active: string }) {
  return (
    <nav className="toolbar picker" aria-label="Company">
      {(["hyperscaler", "neocloud"] as const).map((group) => (
        <span key={group} className="picker-group">
          <span className="picker-label">
            {group === "hyperscaler" ? "Hyperscalers" : "Neoclouds"}
          </span>
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
        </span>
      ))}
    </nav>
  );
}

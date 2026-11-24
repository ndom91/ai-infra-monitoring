type Titled = { id: string; label: string };
type Described = Titled & {
  source: string;
  entity?: string | null;
  unit: string;
  cadence: string;
};

// The part of an id after "family.", e.g. "data_center.saar".
const metricOf = (s: Titled) => s.id.split(".").slice(2).join(".");

const TITLES: [RegExp, string][] = [
  [/^under_construction/, "Capacity under construction"],
  [/^(preleased|precommitted)/, "Share already pre-leased"],
  [/^inventory/, "Total capacity in operation"],
  [/^vacancy/, "Vacancy"],
  [/^net_absorption_mw_annual/, "Net absorption, full year"],
  [/^net_absorption/, "Net absorption, half-year"],
  [/^asking_rent/, "Asking rent"],
  [/^data_center\.saar/, "Construction spending, annual rate"],
  [/^data_center\.nsa/, "Construction spending, monthly"],
];

// Position of a series' title in TITLES; unknown metrics sort last.
export function titleRank(s: Titled) {
  const metric = metricOf(s);
  const i = TITLES.findIndex(([re]) => re.test(metric));
  return i === -1 ? TITLES.length : i;
}

// A short title saying what is measured. Publisher, scope and unit belong in
// the subtitle. EIA ids are "eia.<measure>.<STATE>" and the label starts with
// the state, which the shared chart drops because it plots every state.
export function chartTitle(s: Titled) {
  const eia = /^eia\.[^.]+\.([A-Z]{2})$/.exec(s.id);
  if (eia) return s.label.startsWith(`${eia[1]} `) ? s.label.slice(3) : s.label;
  return TITLES.find(([re]) => re.test(metricOf(s)))?.[1] ?? s.label;
}

export const isCensus = (s: Titled) => s.id.startsWith("census.");

// Who published it, what it covers and in what unit.
export function chartSubtitle(s: Described) {
  if (isCensus(s)) return `US Census Bureau figures, shown with either publisher · ${s.unit}`;
  if (s.id.startsWith("eia.")) {
    return [s.source, s.entity, `${s.unit}${s.cadence === "annual" ? ", annual" : ""}`]
      .filter(Boolean)
      .join(" · ");
  }
  return `${s.entity ?? s.source} · ${s.unit}`;
}

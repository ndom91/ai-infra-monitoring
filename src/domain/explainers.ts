// Plain-language explanations behind each chart's "i" button.
// Written for a general reader: what it shows, how to read it, why it matters.

export type Explainer = {
  what: string;
  read: string;
  why: string;
};

export const EXPLAINERS = {
  // ---- Credit ----
  hySpreads: {
    what: "How much extra interest risky companies pay to borrow, compared with the US government. Split by credit rating, from BB (least risky junk) to CCC (closest to default).",
    read: "Higher means lenders are more nervous. 3% means a company pays 3 percentage points more than a Treasury bond of similar length.",
    why: "Debt-funded data-center builders need cheap credit. When spreads widen, especially for CCC borrowers, refinancing gets harder and weak players fail first.",
  },
  igSpreads: {
    what: "The same extra-interest measure for safer, investment-grade companies (BBB, the lowest investment grade), plus a long-history version from Moody's.",
    read: "Usually small and stable. A clear rise means stress is spreading from risky borrowers to mainstream ones.",
    why: "Large tech companies borrow at investment grade. If these spreads rise, even the biggest AI spenders pay more for capital.",
  },
  yields: {
    what: "Total interest rates (yields), not the extra over Treasuries: high-yield bonds, Baa corporate bonds, and the 10-year Treasury itself.",
    read: "These move with general interest rates as well as credit risk. Compare with the spread charts to see which is driving a change.",
    why: "Projects are financed at the total rate. A data center that works at 6% borrowing cost may not work at 9%.",
  },
  issuerDebt: {
    what: "Interest rates AI infrastructure companies agreed to when they issued bonds or took loans, taken from their filings.",
    read: "Each row is one deal at the moment it was signed, not today's market price. 'SOFR margin' is the extra paid over a floating benchmark rate.",
    why: "Rising rates on new deals, or reliance on convertibles and asset-backed notes, show how hard and costly it is for these companies to keep raising money.",
  },

  // ---- Market ----
  gpuListPrice: {
    what: "What Amazon and Microsoft charge per hour to rent one GPU, from their public price lists. 'Spot' is a discounted price for spare capacity that can be taken back.",
    read: "Flat steps mean the list price did not change. A sudden step down is a price cut.",
    why: "Falling rental prices can mean too much capacity chasing too little demand. But newer chips also make older ones cheaper on purpose, so a cut is not proof of trouble.",
  },
  gpuResale: {
    what: "An index of what used data-center GPUs actually sold for, as a share of their price when new. 100 = the level in the first half of 2025.",
    read: "Falling means used GPUs are worth less.",
    why: "Many AI data centers borrowed money using GPUs as collateral. If resale values fall faster than the loans are repaid, lenders are less protected.",
  },

  // ---- Fundamentals: peers ----
  capexIntensityHyper: {
    what: "How much each big tech company spends on buildings and equipment (capex) compared with the cash its business brings in, over the last 12 months.",
    read: "1× means all operating cash goes into capex. Below 1× leaves cash spare; above 1× means borrowing or savings fund the gap.",
    why: "These companies can afford heavy spending, but a ratio climbing toward or above 1× shows the AI build-out is eating more of their cash.",
  },
  capexIntensityNeo: {
    what: "The same capex-to-cash ratio for specialist AI cloud companies ('neoclouds') such as CoreWeave.",
    read: "Values far above 1× mean spending many times what the business earns in cash. Gaps appear where operating cash was negative.",
    why: "Neoclouds fund most of their build-out with debt. Very high ratios mean they depend on lenders staying willing.",
  },
  leverageNeo: {
    what: "Each neocloud's debt and lease obligations divided by a year of operating cash.",
    read: "Roughly: how many years of current cash flow it would take to repay what they owe. Higher means more stretched.",
    why: "Highly indebted companies are the first to struggle if demand or GPU prices fall.",
  },
  conversionPeers: {
    what: "How much revenue each company earned in the last year, compared with the contracted backlog it reported a year earlier.",
    read: "Lower means backlog is turning into actual revenue more slowly. Companies differ a lot, so compare each one with its own history.",
    why: "Big backlog numbers are only valuable if customers pay. Slowing conversion can be an early sign of delays or weaker demand.",
  },

  // ---- Fundamentals: selected company ----
  capexVsOcf: {
    what: "Each quarter's capital spending next to the cash the business generated from operations.",
    read: "When the capex line sits well above the cash line, the company is spending more than it earns and funding the rest elsewhere.",
    why: "A widening gap must be filled with debt, leases, or new shares.",
  },
  fcf: {
    what: "Free cash flow: operating cash minus capital spending, over the last 12 months.",
    read: "Above zero, the company generates spare cash. Below zero, it is burning cash to grow.",
    why: "Deeply negative free cash flow is normal during a build-out, but it only works while financing stays available.",
  },
  debtLeases: {
    what: "What the company owes at each quarter end: long-term debt, finance and operating leases, alongside its cash.",
    read: "Rising lines mean growing obligations. Compare with cash to see how much cushion exists.",
    why: "Leases are a common way to finance data centers and GPUs. They are debt-like even when not called debt.",
  },
  leverageCoverage: {
    what: "Two ratios: debt relative to a year of operating cash, and how many times operating cash covers interest actually paid.",
    read: "Debt ratio: lower is safer. Interest coverage: higher is safer; near 1× means cash barely covers interest.",
    why: "These show whether the company can carry its debt from the business itself.",
  },
  interest: {
    what: "Interest expense reported in the accounts next to interest actually paid in cash.",
    read: "Both rising steeply means borrowing is growing fast or getting more expensive.",
    why: "Interest is a fixed cost. It has to be paid even if GPU demand slows.",
  },
  backlog: {
    what: "Contracted future revenue (RPO, 'remaining performance obligations'), quarterly revenue, and money customers still owe (receivables).",
    read: "Backlog far above revenue means lots of promised work ahead. Receivables rising faster than revenue can mean customers pay more slowly.",
    why: "Backlog is not cash. Contracts can be delayed, cut, or renegotiated.",
  },
  conversion: {
    what: "Last year's revenue divided by the backlog reported one year before.",
    read: "A falling line means backlog is turning into revenue more slowly than before.",
    why: "If promised demand keeps growing but conversion slows, some of that demand may never arrive.",
  },
  growth: {
    what: "Year-over-year growth of backlog, revenue, and receivables.",
    read: "Healthy: all three grow together. Warning: backlog grows much faster than revenue, or receivables outpace revenue.",
    why: "Mismatched growth can be an early sign that headline demand is ahead of real payments.",
  },

  // ---- Concentration ----
  concentrationFy: {
    what: "The share of a company's yearly revenue that comes from its biggest customers, as disclosed in filings.",
    read: "Higher means the company relies more on one or a few customers.",
    why: "If a single large customer cuts back, revenue can drop sharply. Strong customers like Microsoft make this less risky, not risk-free.",
  },
  concentrationQ: {
    what: "The same customer-dependence measure for single quarters.",
    read: "Kept separate from yearly figures because one quarter can swing a lot.",
    why: "Quarter-to-quarter jumps show how quickly dependence on a customer is changing.",
  },
  contracts: {
    what: "Large customer deals announced by AI infrastructure companies, with their total stated value.",
    read: "Each row is one announcement. Values are totals over many years and may include options.",
    why: "These deals justify much of the build-out. They are promises, not guaranteed revenue.",
  },

  // ---- Depreciation ----
  usefulLife: {
    what: "How many years companies assume their servers last for accounting purposes. Each step is a change they announced.",
    read: "A step up means costs are spread over more years, which raises reported profit. A step down is the opposite.",
    why: "If GPUs become outdated faster than assumed, profits are overstated today and write-downs may come later.",
  },
  da: {
    what: "Depreciation and amortization: the accounting cost of equipment wearing out, each quarter.",
    read: "Rising fast means the company has bought a lot of equipment that is now being expensed.",
    why: "This cost catches up with heavy capex over time and squeezes reported profit.",
  },

  // ---- Infrastructure (picked by metric) ----
  vacancy: {
    what: "The share of finished data-center capacity that is empty and available to lease.",
    read: "Very low (1–3%) means almost everything is taken. Rising vacancy means supply is catching up with demand.",
    why: "Vacancy usually rises late, after a slowdown has started. Power shortages can also keep it artificially low.",
  },
  construction: {
    what: "Data-center capacity being built right now, in megawatts (MW) of power.",
    read: "Higher means more supply is on the way.",
    why: "Fast-growing construction is fine if it is already leased. If not, it can become future overcapacity.",
  },
  preleasing: {
    what: "The share of capacity under construction that is already leased before it is finished.",
    read: "High (80%+) means builders have customers lined up. Falling means more speculative building.",
    why: "Construction rising while preleasing falls is a classic sign of a building boom running ahead of demand.",
  },
  absorption: {
    what: "Net absorption: how much capacity tenants newly occupied in a period.",
    read: "Higher means strong demand. Falling absorption while construction rises means supply is outpacing demand.",
    why: "It is the most direct measure of real demand for data-center space.",
  },
  inventory: {
    what: "Total operating data-center capacity in the market.",
    read: "Shows how much the market has grown. Compare with absorption to judge how quickly new space is filled.",
    why: "Fast inventory growth needs matching demand to avoid empty space later.",
  },
  rent: {
    what: "Average asking rent for data-center space, per kilowatt per month.",
    read: "Rising rents mean landlords have pricing power. Flat or falling rents suggest demand is cooling.",
    why: "Rents usually react before vacancy does.",
  },
  infraGeneric: {
    what: "A data-center market figure from a broker report (CBRE or JLL).",
    read: "Each point is one report. Publishers define markets differently, so their figures are never mixed in one chart.",
    why: "Physical supply and demand show whether the build-out is being absorbed.",
  },

  // ---- Overview divergences ----
  divRentalCapex: {
    what: "Big tech's combined capital spending next to the price to rent an H100 GPU.",
    read: "Each line has its own scale. The warning pattern is spending still rising while rental prices fall.",
    why: "That combination suggests money keeps flowing into capacity the market values less and less.",
  },
  divSpreadsBacklog: {
    what: "CoreWeave's contracted backlog next to the high-yield credit spread.",
    read: "Watch for spreads rising (credit getting tighter) while backlog keeps growing.",
    why: "Growing commitments need financing. If credit tightens, delivering on that backlog gets harder.",
  },
  divCollateralDebt: {
    what: "A used-GPU resale index next to CoreWeave's long-term debt.",
    read: "Watch for resale values falling while debt stays high or grows.",
    why: "Loans backed by GPUs become riskier as those GPUs lose value.",
  },
  divConstructionPreleasing: {
    what: "Data-center capacity under construction next to the share already leased.",
    read: "Watch for construction rising while the leased share falls.",
    why: "That means more building is speculative, raising the risk of empty capacity later.",
  },
  divLivesFcf: {
    what: "Big tech's combined free cash flow next to the average accounting life of their servers.",
    read: "Watch for useful lives rising (which flatters profits) while free cash flow falls.",
    why: "Profits can look healthy on paper while the cash reality weakens.",
  },
} satisfies Record<string, Explainer>;

export type ExplainerKey = keyof typeof EXPLAINERS;

// Infrastructure charts are generated per publisher, so pick by series id.
export function infraExplainer(seriesIds: string[]): Explainer {
  const id = seriesIds.join(" ");
  if (/vacancy/.test(id)) return EXPLAINERS.vacancy;
  if (/prelease|precommitted|pre-leas/.test(id)) return EXPLAINERS.preleasing;
  if (/absorption/.test(id) && !/inventory/.test(id)) return EXPLAINERS.absorption;
  if (/inventory|active_capacity/.test(id)) return EXPLAINERS.inventory;
  if (/under_construction/.test(id)) return EXPLAINERS.construction;
  if (/rent/.test(id)) return EXPLAINERS.rent;
  return EXPLAINERS.infraGeneric;
}

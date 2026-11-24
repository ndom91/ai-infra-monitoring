import type { IndicatorId } from "./types";

export type Section = "market" | "credit" | "infrastructure" | "fundamentals";
export type Classification =
  | "Leading"
  | "Leading / coincident"
  | "Coincident / lagging"
  | "Mixed"
  | "Structural";

// What each classification means for timing, in plain words.
export const CLASSIFICATION_TIMING: Record<Classification, string> = {
  Leading: "An early signal: it tends to move before stress shows elsewhere.",
  "Leading / coincident": "Moves early or as stress emerges.",
  "Coincident / lagging": "Moves as stress happens or afterwards.",
  Mixed: "Combines early and later signs of stress.",
  Structural: "Describes underlying conditions, not the timing of stress.",
};

export type IndicatorDef = {
  id: IndicatorId;
  number: string;
  title: string;
  section: Section;
  classification: Classification;
  measures: string;
  deterioration: string;
  caveats: string[];
  sources: { label: string; url: string }[];
};

export const INDICATORS: IndicatorDef[] = [
  {
    id: "gpu_rental",
    number: "01",
    title: "GPU rental pricing",
    section: "market",
    classification: "Leading",
    measures:
      "What it costs per hour to rent one GPU, from published price lists: AWS and Azure H100 and H200, Salad RTX 4090 and RTX 5090 by priority tier, and Runcrate H200, RTX 4090 and RTX 5090 starting rates.",
    deterioration:
      "Published prices falling, especially for chips that are not simply being replaced by a newer generation. Falling rental prices mean data centers earn less per GPU, which makes their debt harder to service.",
    caveats: [
      "These are published list or marketplace prices, not transaction prices. They exclude the negotiated discounts most large buyers receive.",
      "Azure spot and Salad priority tiers can be taken back at short notice, so they carry preemption risk and are kept as separate series from on-demand prices.",
      "Prices say nothing about how much capacity is rented or sitting idle. There is no inventory data.",
      "Runcrate is a partner marketplace. Its figure is the lowest starting price across orderable options, not a standard price schedule.",
      "Salad is one managed community-cloud price schedule, and AWS and Azure are single reference regions. None is a market-wide average.",
    ],
    sources: [
      {
        label: "Azure Retail Prices API",
        url: "https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices",
      },
      {
        label: "AWS Price List Bulk API",
        url: "https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-the-aws-price-list-bulk-api.html",
      },
      { label: "Salad Community Cloud pricing", url: "https://salad.com/pricing/" },
      { label: "Runcrate GPU pricing feed", url: "https://www.runcrate.ai/gpus.json" },
    ],
  },
  {
    id: "gpu_resale",
    number: "02",
    title: "GPU resale & collateral value",
    section: "market",
    classification: "Leading",
    measures:
      "What used data-center GPUs sell for. These GPUs often secure the loans that paid for them.",
    deterioration:
      "Resale values falling faster than the GPUs are written down or the loans repaid. Lenders then have less to recover.",
    caveats: [
      "Asking prices, actual sales, dealer offers and liquidation estimates are different things. They are never mixed in one series.",
      "No free, licensed data on individual sales exists. Coverage depends on what published indexes allow.",
    ],
    sources: [
      {
        label: "AMCompute GPU resale index",
        url: "https://www.amcompute.com/gpu-resale-index",
      },
      {
        label: "ServerBuyBack GPU index",
        url: "https://serverbuyback.com/resources/gpu-resale-value-index/",
      },
    ],
  },
  {
    id: "credit",
    number: "03",
    title: "Credit spreads & borrowing costs",
    section: "credit",
    classification: "Leading / coincident",
    measures:
      "Extra yield investors demand to lend to risky companies over Treasuries, by rating tier, plus the debt terms of AI infrastructure issuers.",
    deterioration:
      "Spreads widening, especially in CCC and single-B, where leveraged infrastructure borrowers sit. AI issuers paying more than similarly rated peers is a specific warning.",
    caveats: [
      "Index spreads are broad market proxies, not AI-specific.",
      "A yield is not a spread, and a spread is not a default probability.",
      "ICE BofA history on FRED is limited to a rolling 3 years. Older values exist only if this monitor stored them.",
      "Instrument-level debt requires tagged debt notes in 10-Qs or 10-Ks from tracked neoclouds and AI labs. Private companies' loans and datacenter ABS are not covered.",
    ],
    sources: [
      { label: "FRED", url: "https://fred.stlouisfed.org/" },
      { label: "SEC EDGAR (XBRL debt notes)", url: "https://www.sec.gov/edgar" },
      {
        label: "FINRA fixed income",
        url: "https://www.finra.org/finra-data/fixed-income",
      },
    ],
  },
  {
    id: "capex_cashflow",
    number: "04",
    title: "Capex, cash flow & leverage",
    section: "fundamentals",
    classification: "Leading",
    measures:
      "Capital spending compared with the cash the business brings in to pay for it. Plus debt, leases and interest.",
    deterioration:
      "Capex growing faster than operating cash flow, negative free cash flow covered by debt or leases, and interest getting harder to cover. Watch heavily indebted neoclouds most.",
    caveats: [
      "Hyperscalers pay from large cash flows, neoclouds rely on debt, suppliers sell hardware, datacenter REITs own buildings, and AI labs sell access to models. Compare companies within their group.",
      "Finance leases and off-balance-sheet commitments hide part of the real spending.",
      "Some quarters are worked out from year-to-date filings, and are marked as calculated.",
    ],
    sources: [
      {
        label: "SEC EDGAR XBRL",
        url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
      },
    ],
  },
  {
    id: "customer_concentration",
    number: "05",
    title: "Customer concentration",
    section: "fundamentals",
    classification: "Leading",
    measures: "The share of revenue from the biggest customers, as disclosed in filings.",
    deterioration:
      "Growing dependence on one or two customers, or a major customer cutting back, renegotiating or not renewing.",
    caveats: [
      "Disclosures are irregular, and each company defines them differently.",
      "High concentration is a risk, not a loss. A strong customer can make it acceptable.",
    ],
    sources: [{ label: "SEC EDGAR", url: "https://www.sec.gov/edgar/search/" }],
  },
  {
    id: "construction",
    number: "06",
    title: "Data-center construction & preleasing",
    section: "infrastructure",
    classification: "Leading",
    measures:
      "Data-center capacity being built, in megawatts, and how much of it is already leased. Also the dollars spent on US data-center construction each month (Census).",
    deterioration:
      "Building speeds up while less of it is leased in advance. More capacity is being built on speculation.",
    caveats: [
      "Brokers define markets differently. CBRE and JLL figures are never merged.",
      "Broker reports come out twice a year, with a delay.",
      "Census spending counts construction work only, not land or servers and GPUs, and covers the US only. Its latest months are preliminary and are often revised.",
    ],
    sources: [
      { label: "CBRE insights", url: "https://www.cbre.com/insights" },
      { label: "JLL insights", url: "https://www.jll.com/en-us/insights" },
      {
        label: "Census construction spending",
        url: "https://www.census.gov/construction/c30/historical_data.html",
      },
    ],
  },
  {
    id: "vacancy",
    number: "07",
    title: "Vacancy & net absorption",
    section: "infrastructure",
    classification: "Coincident / lagging",
    measures:
      "The share of finished capacity sitting empty, and how much new space tenants took up each period.",
    deterioration:
      "Vacancy rising from record lows while take-up slows and asking rents flatten or fall.",
    caveats: [
      "Power shortages limit new supply and can keep vacancy artificially low.",
      "Only finished, powered capacity counts here, not announced projects.",
    ],
    sources: [
      { label: "CBRE insights", url: "https://www.cbre.com/insights" },
      { label: "JLL insights", url: "https://www.jll.com/en-us/insights" },
    ],
  },
  {
    id: "power_grid",
    number: "10",
    title: "Power & grid context",
    section: "infrastructure",
    classification: "Leading / coincident",
    measures: "Commercial electricity sales and prices in major data-center-market states.",
    deterioration:
      "Commercial electricity demand rising faster than supply, or power prices rising sharply.",
    caveats: [
      "State-wide commercial electricity data is not data-center-specific demand.",
      "Monthly values are preliminary estimates and can be revised by EIA.",
    ],
    sources: [
      {
        label: "U.S. Energy Information Administration",
        url: "https://www.eia.gov/electricity/data/eia861m/",
      },
    ],
  },
  {
    id: "contract_conversion",
    number: "08",
    title: "Contracted vs realized revenue",
    section: "fundamentals",
    classification: "Mixed",
    measures:
      "The contracted order book (remaining performance obligations, or RPO) compared with revenue actually earned and money customers still owe.",
    deterioration:
      "The order book keeps growing while revenue lags, or money owed grows faster than revenue. Customers may be promising more than they pay.",
    caveats: [
      "An order book isn't guaranteed cash. Contracts can be cancelled or renegotiated.",
      "Companies define and time RPO differently.",
      "Days sales outstanding and inventory days are calculated and depend on each company's business model. Compare a company with its own history, or within its group.",
    ],
    sources: [
      {
        label: "SEC EDGAR XBRL",
        url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
      },
    ],
  },
  {
    id: "depreciation",
    number: "09",
    title: "Depreciation & useful life",
    section: "fundamentals",
    classification: "Structural",
    measures:
      "How long companies assume their servers and network gear will last in their accounts, and when they change it.",
    deterioration:
      "Lifespans stretched while GPUs go out of date faster. Profits then look better than the reality. Any shortening is a direct admission.",
    caveats: [
      "The accounting lifespan isn't what the equipment would sell for.",
      "Not all servers share one schedule, and most disclosures aren't GPU-specific.",
    ],
    sources: [{ label: "SEC EDGAR", url: "https://www.sec.gov/edgar/search/" }],
  },
  {
    id: "insider_activity",
    number: "11",
    title: "Insider selling",
    section: "fundamentals",
    classification: "Leading / coincident",
    measures:
      "Dollars of company stock that directors, officers and large holders sold on the open market each month, from Form 4 filings. Calculated as shares times the reported price.",
    deterioration:
      "Sales climb well above a company's own normal level, across many insiders at once, outside of pre-scheduled plans.",
    caveats: [
      "Insiders sell for routine reasons: diversification, taxes, house purchases. A single month is weak evidence.",
      "Many sales run under Rule 10b5-1 plans set months earlier. Those are shown separately and say little about current views. The plan box covers a whole filing, so the split is an upper bound.",
      "Option exercises, tax withholding, gifts and grants are excluded. Sales that report no price are skipped, not estimated.",
      "The current month is incomplete until it ends. Filings before 2023 carry no plan flag, so their plan split is left blank.",
    ],
    sources: [
      {
        label: "SEC EDGAR Form 4",
        url: "https://www.sec.gov/files/forms-3-4-5.pdf",
      },
    ],
  },
];

export function indicatorById(id: IndicatorId) {
  const def = INDICATORS.find((i) => i.id === id);
  if (!def) throw new Error(`unknown indicator ${id}`);
  return def;
}

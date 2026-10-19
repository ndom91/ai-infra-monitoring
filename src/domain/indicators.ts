import type { IndicatorId } from "./types";

export type Section = "market" | "credit" | "infrastructure" | "fundamentals";
export type Classification =
  | "Leading"
  | "Leading / coincident"
  | "Coincident / lagging"
  | "Mixed"
  | "Structural";

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

export const SECTIONS: { id: Section; label: string; blurb: string }[] = [
  {
    id: "market",
    label: "Market economics",
    blurb: "What it costs to rent a GPU, and what a used one is worth.",
  },
  {
    id: "credit",
    label: "Financing & credit",
    blurb: "What it costs to borrow, for the market and for AI companies.",
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    blurb: "How much is being built, and whether it fills up.",
  },
  {
    id: "fundamentals",
    label: "Company fundamentals",
    blurb:
      "Spending, cash, debt, order books, customers and server lifespans, from company filings.",
  },
];

export const INDICATORS: IndicatorDef[] = [
  {
    id: "gpu_rental",
    number: "01",
    title: "GPU rental pricing",
    section: "market",
    classification: "Leading",
    measures:
      "The extra interest risky companies pay to borrow compared with the US government, by credit rating. Plus the debt terms AI infrastructure companies got.",
    deterioration:
      "Spreads widening, especially for CCC and single-B, where heavily indebted infrastructure borrowers sit. AI companies paying more than similarly rated peers is a specific warning.",
    caveats: [
      "Index spreads cover the whole market, not just AI.",
      "A yield is not a spread, and a spread is not the chance of default.",
      "FRED only keeps 3 years of ICE BofA history. Older values exist only if this monitor saved them.",
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
    ],
    sources: [
      { label: "FRED", url: "https://fred.stlouisfed.org/" },
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
      "Hyperscalers pay from huge cash flows; neoclouds rely on debt. Compare within each group, not across.",
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
      "Data-center capacity being built, in megawatts, and how much of it is already leased.",
    deterioration:
      "Building speeds up while less of it is leased in advance. More capacity is being built on speculation.",
    caveats: [
      "Brokers define markets differently. CBRE and JLL figures are never merged.",
      "Reports come out twice a year, with a delay.",
    ],
    sources: [
      { label: "CBRE insights", url: "https://www.cbre.com/insights" },
      { label: "JLL insights", url: "https://www.jll.com/en-us/insights" },
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
];

export function indicatorById(id: IndicatorId) {
  const def = INDICATORS.find((i) => i.id === id);
  if (!def) throw new Error(`unknown indicator ${id}`);
  return def;
}

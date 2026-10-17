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
    blurb: "GPU rental pricing, availability, and collateral values.",
  },
  {
    id: "credit",
    label: "Financing & credit",
    blurb: "Borrowing costs, spreads, and issuer debt terms.",
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    blurb: "Construction, preleasing, vacancy, and absorption.",
  },
  {
    id: "fundamentals",
    label: "Company fundamentals",
    blurb: "Capex, cash flow, leverage, backlog, concentration, and depreciation.",
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
      "Hourly list prices per GPU for H100 and H200 instances on Azure (on-demand and spot) and AWS (on-demand).",
    deterioration:
      "Cuts to list or spot prices for the same GPU, especially spot falling while on-demand holds. That suggests idle capacity being discounted.",
    caveats: [
      "These are hyperscaler list prices, a weak proxy. They change rarely, show no inventory, and exclude the negotiated discounts large buyers get.",
      "Marketplace prices (Vast.ai, Shadeform) would be a better signal, but their terms forbid building price indexes without written permission.",
      "AWS history covers the last 24 months of monthly price lists. Azure only states when the current price took effect.",
      "Price cuts alone are not distress: newer GPUs lower the value of older ones by design.",
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
    ],
  },
  {
    id: "gpu_resale",
    number: "02",
    title: "GPU resale & collateral value",
    section: "market",
    classification: "Leading",
    measures:
      "Secondary-market value of enterprise GPUs, the assets that secure much GPU-backed debt.",
    deterioration:
      "Resale values falling faster than the depreciation schedules and loan amortization they back. Recoverable collateral shrinks relative to outstanding debt.",
    caveats: [
      "Asking prices, completed sales, dealer buyback offers, and liquidation estimates are different things. They are never mixed in one series.",
      "No free, licensed, transaction-level dataset was found. Coverage depends on what published indices allow.",
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
      "Capital spending against the operating cash that funds it, plus debt, lease obligations, and interest burden.",
    deterioration:
      "Capex rising faster than operating cash flow, negative free cash flow funded by debt or leases, and falling interest coverage. Watch highly leveraged neoclouds most.",
    caveats: [
      "Hyperscalers fund capex from very large cash flows. Neoclouds rely on debt. Compare within groups, not across them.",
      "Finance leases and off-balance-sheet commitments hide part of the true spend.",
      "Quarterly figures are derived from year-to-date filings where needed, and marked as calculated.",
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
    measures: "Share of revenue from the largest customers, as disclosed in filings.",
    deterioration:
      "Rising dependence on one or two customers, or a major customer cutting, renegotiating, or not renewing a contract.",
    caveats: [
      "Disclosures are irregular and definitions vary by filer.",
      "High concentration is a risk, not a loss. Strong counterparties can make it acceptable.",
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
      "Capacity under construction (MW) and the share of it already leased before completion.",
    deterioration:
      "Construction accelerating while the preleased share falls. The unleased pipeline grows, which is speculative supply.",
    caveats: [
      "Broker reports use different market definitions. CBRE and JLL figures are never merged.",
      "Reports are semiannual and published with a lag.",
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
      "Share of operational capacity that is empty, and the net capacity newly occupied each period.",
    deterioration:
      "Vacancy rising from record lows while absorption slows, and asking rents flattening or falling.",
    caveats: [
      "Power shortages limit new supply and can keep vacancy artificially low.",
      "Operational, powered capacity differs from announced projects. Only the former counts here.",
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
      "Remaining performance obligations (contracted backlog) against recognized revenue and receivables.",
    deterioration:
      "Backlog keeps rising while revenue conversion slows, or receivables grow faster than revenue. Customers may be committing more than they pay.",
    caveats: [
      "Backlog is not guaranteed cash. Contracts can be cancelled or renegotiated.",
      "RPO definitions and timing differ by company.",
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
      "The accounting useful life companies assume for servers and network equipment, and when they change it.",
    deterioration:
      "Useful lives extended while GPUs become obsolete faster. Earnings then look better than the economics. Any shortening of lives is a direct admission.",
    caveats: [
      "Accounting useful life is not resale or collateral value.",
      "Not all server equipment shares one schedule, and most disclosures are not GPU-specific.",
    ],
    sources: [{ label: "SEC EDGAR", url: "https://www.sec.gov/edgar/search/" }],
  },
];

export function indicatorById(id: IndicatorId) {
  const def = INDICATORS.find((i) => i.id === id);
  if (!def) throw new Error(`unknown indicator ${id}`);
  return def;
}

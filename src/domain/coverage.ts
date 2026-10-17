import type { IndicatorId } from "./types";

export type CoverageStatus = "implemented" | "partial" | "unavailable";

// Hand-maintained: what each indicator can and cannot show, and why.
// Mirrored in docs/coverage.md.
export const COVERAGE: Record<
  IndicatorId,
  { status: CoverageStatus; collectors: string[]; summary: string; gaps: string[] }
> = {
  gpu_rental: {
    status: "partial",
    collectors: ["azure", "aws"],
    summary:
      "Hyperscaler list prices for H100 and H200: Azure on-demand and spot (eastus2), AWS on-demand (us-east-1). Collected weekly.",
    gaps: [
      "Marketplace prices are not collected: Vast.ai (Sep 2026) and Shadeform (Aug 2026) terms prohibit building price indexes or databases without written permission.",
      "List prices carry no inventory or utilization signal.",
      "Microsoft API terms forbid redistributing the data: keep the dashboard private.",
      "GCP's pricing API needs an API key and is not used.",
    ],
  },
  gpu_resale: {
    status: "partial",
    collectors: ["manual"],
    summary:
      "American Compute GPU resale index (monthly basket of realized sale prices as a share of price new), entered manually with attribution.",
    gaps: [
      "An index, not per-model USD prices; no completed-transaction data per GPU.",
      "ServerBuyback publishes no reuse license and only estimate ranges; not used.",
      "No source links resale values to secured debt balances.",
    ],
  },
  credit: {
    status: "partial",
    collectors: ["fred", "manual"],
    summary:
      "Index spreads by rating (ICE BofA via FRED) and Moody's Baa context, daily. Coupons and loan margins at issue for CoreWeave and other neoclouds, from filings.",
    gaps: [
      "ICE BofA history on FRED is limited to a rolling 3 years; older values exist only if collected here.",
      "No market prices or yields for individual AI issuer bonds: FINRA's free per-bond data forbids automated collection, and the TRACE feed needs a paid agreement.",
      "Ratings are verified for only one CoreWeave note; agency pages are gated.",
    ],
  },
  capex_cashflow: {
    status: "implemented",
    collectors: ["sec"],
    summary:
      "Quarterly capex, OCF, D&A, interest, debt, and leases for MSFT, GOOGL, AMZN, META, ORCL, CRWV, CORZ, IREN, APLD from SEC XBRL, with TTM ratios derived at read time.",
    gaps: [
      "Nebius files 20-F only (no quarterly XBRL) and is excluded.",
      "Some tags change over time; older history under a previous tag is not stitched in (e.g. CRWV debt after Mar 2026, MSFT/ORCL cash interest paid).",
      "Off-balance-sheet commitments and debt maturities are disclosed in text, not XBRL, and are not captured.",
    ],
  },
  customer_concentration: {
    status: "partial",
    collectors: ["manual"],
    summary:
      "Disclosed revenue shares and announced contract values for CoreWeave, Core Scientific, Nebius, IREN, Applied Digital, Cipher, TeraWulf, Hut 8; cited manually.",
    gaps: [
      "Disclosures are irregular; some filers give contract values but no revenue share.",
      "CoreWeave Q4-only shares and its 2026 largest customers are not disclosed.",
    ],
  },
  construction: {
    status: "partial",
    collectors: ["manual"],
    summary:
      "CBRE primary-market construction and preleasing (H2 2021 onward) and JLL under-construction and preleasing, cited manually per report.",
    gaps: [
      "Broker reports are not published as datasets; entries are manual on each release.",
      "JLL changed coverage twice; its series are split by definition and never joined.",
      "Some CBRE half-years state no preleasing figure.",
    ],
  },
  vacancy: {
    status: "partial",
    collectors: ["manual"],
    summary:
      "CBRE and JLL vacancy, absorption, inventory, and asking rents, cited manually per report.",
    gaps: [
      "Several CBRE half-year absorption figures appear only in charts and were left out.",
      "JLL 2022–2023 reports could not be retrieved.",
    ],
  },
  contract_conversion: {
    status: "implemented",
    collectors: ["sec"],
    summary:
      "RPO, revenue, and receivables from SEC XBRL, with RPO conversion and YoY growth derived at read time.",
    gaps: [
      "META reports no RPO; AMZN's RPO tag stops in 2020.",
      "Contract cancellations and payment problems appear only in filing text.",
    ],
  },
  depreciation: {
    status: "partial",
    collectors: ["manual", "sec"],
    summary:
      "Server and network useful-life changes for AMZN, META, GOOGL, MSFT, ORCL, CRWV, NBIS, IREN with effective dates, cited from filings; D&A expense from SEC XBRL.",
    gaps: [
      "Disclosures are rarely GPU-specific; some changes apply to subsets of servers (e.g. Amazon 2025).",
      "Applied Digital and Core Scientific disclose only ranges.",
      "Book-vs-resale curves need per-model resale prices, which are not available.",
    ],
  },
};

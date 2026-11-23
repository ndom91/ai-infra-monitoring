import type { IndicatorId } from "./types";

export type CoverageStatus = "implemented" | "partial" | "unavailable";

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  implemented: "Full",
  partial: "Partial",
  unavailable: "Not available",
};

// Hand-maintained: what each indicator can and cannot show, and why.
// Mirrored in docs/coverage.md.
export const COVERAGE: Record<
  IndicatorId,
  { status: CoverageStatus; collectors: string[]; summary: string; gaps: string[] }
> = {
  gpu_rental: {
    status: "partial",
    collectors: ["azure", "aws", "salad", "runcrate"],
    summary:
      "AWS and Azure list prices for H100 and H200 GPUs, Salad Community Cloud's published RTX 4090 and RTX 5090 prices by priority tier, and Runcrate's published H200, RTX 4090 and RTX 5090 starting rates. Collected weekly.",
    gaps: [
      "Salad is a single managed community-cloud price schedule, not a host-by-host marketplace. Vast.ai (Sep 2026) and Shadeform (Aug 2026) terms forbid building price indexes or databases without written permission. RunPod (checked Nov 2026) forbids data mining and automated data gathering.",
      "Prices do not show how much capacity is in use. Salad priority tiers differ in preemption risk.",
      "Microsoft's API terms forbid sharing the data, so keep this dashboard private.",
      "Google Cloud's pricing API needs an API key and isn't used.",
    ],
  },
  gpu_resale: {
    status: "partial",
    collectors: ["manual"],
    summary:
      "American Compute's GPU resale index: a monthly basket of real sale prices as a share of the price new. Entered by hand with credit.",
    gaps: [
      "It's an index, not dollar prices per GPU model. There is no per-GPU sales data.",
      "ServerBuyback publishes only estimate ranges and no license to reuse them, so it isn't used.",
      "No source links resale values to the loans they secure.",
    ],
  },
  credit: {
    status: "partial",
    collectors: ["fred", "sec_debt", "manual"],
    summary:
      "Daily borrowing costs by credit rating (ICE BofA via FRED), plus Moody's Baa for long history. Debt instrument by instrument (facilities, notes, loans: carrying amount, face amount, stated and effective rates, spreads) for CoreWeave, Core Scientific, IREN and Applied Digital, from the XBRL data in their 10-Q and 10-K filings. Rates CoreWeave and other neoclouds agreed when they borrowed, from filings, entered by hand (a frozen record).",
    gaps: [
      "Private companies' GPU-backed loans and datacenter ABS (Lambda, Crusoe, Vantage, Switch, Aligned, STACK) are not covered. Their terms appear only in press releases on sites that block automated access.",
      "Instruments are stored under the name each filing gives them. If a company renames a facility, the old and new names are separate series.",
      "FRED only keeps the last 3 years of ICE BofA data. Older values exist only if this monitor saved them.",
      "No market prices for individual AI company bonds. FINRA's free data forbids automated collection, and its TRACE feed needs a paid agreement.",
      "Credit ratings are confirmed for only one CoreWeave note. Rating agency pages need a login.",
    ],
  },
  capex_cashflow: {
    status: "implemented",
    collectors: ["sec"],
    summary:
      "Quarterly capex, operating cash flow, depreciation, interest, debt and leases for hyperscalers (MSFT, GOOGL, AMZN, META, ORCL), neoclouds (CRWV, CORZ, IREN, APLD), suppliers (NVDA, AMD, AVGO, SMCI, DELL) and datacenter REITs (DLR, EQIX), from SEC filings. Purchase obligations are included where companies tag them, which is rare. Compare within a group, not across. 12-month ratios are calculated on the fly.",
    gaps: [
      "Nebius files only annual 20-F reports with no quarterly data, so it's left out.",
      "Some data labels change over time, and history under an old label isn't joined up. Examples: CRWV debt after Mar 2026, MSFT and ORCL cash interest paid.",
      "Off-balance-sheet commitments and debt due dates appear only in filing text, so they aren't captured.",
    ],
  },
  customer_concentration: {
    status: "partial",
    collectors: ["manual"],
    summary:
      "Revenue share from top customers and announced contract values for CoreWeave, Core Scientific, Nebius, IREN, Applied Digital, Cipher, TeraWulf and Hut 8. Entered by hand with citations.",
    gaps: [
      "Disclosures are irregular. Some companies give contract values but no revenue share.",
      "CoreWeave doesn't disclose Q4-only shares or its largest 2026 customers.",
    ],
  },
  construction: {
    status: "partial",
    collectors: ["manual"],
    summary:
      "CBRE construction and pre-leasing for main markets (H2 2021 onward), and JLL construction and pre-leasing. Entered by hand from each report.",
    gaps: [
      "Broker reports aren't published as data, so each release is entered by hand.",
      "JLL changed what it covers twice. Its series are split at each change and never joined.",
      "Some CBRE half-years give no pre-leasing figure.",
    ],
  },
  vacancy: {
    status: "partial",
    collectors: ["manual"],
    summary:
      "CBRE and JLL vacancy, take-up (net absorption), total capacity and asking rents. Entered by hand from each report.",
    gaps: [
      "Several CBRE half-year take-up figures appear only in charts, so they were left out.",
      "JLL's 2022–2023 reports couldn't be retrieved.",
    ],
  },
  power_grid: {
    status: "partial",
    collectors: ["eia"],
    summary:
      "Monthly commercial electricity sales and average prices for Virginia, Texas, Arizona, Illinois, Georgia and Pennsylvania, from EIA Form EIA-861M.",
    gaps: [
      "State-wide commercial electricity data is not data-center-specific demand.",
      "The monthly survey is preliminary and can be revised. It does not show local grid capacity or connection availability.",
    ],
  },
  contract_conversion: {
    status: "implemented",
    collectors: ["sec"],
    summary:
      "Order book (RPO), revenue, money owed by customers and inventory, from SEC filings. How fast the order book turns into revenue, yearly growth, days sales outstanding and inventory days are calculated on the fly.",
    gaps: [
      "Meta reports no order book. Amazon's order-book data stops in 2020.",
      "Cancelled contracts and late payments appear only in filing text.",
    ],
  },
  insider_activity: {
    status: "implemented",
    collectors: ["sec_insider"],
    summary:
      "Monthly dollar value of open-market insider sales for every tracked SEC company, parsed from Form 4 filings and calculated as shares times price. Sales made under Rule 10b5-1 plans are split out where the filing says so.",
    gaps: [
      "Only sales with a reported price count; sales without one are skipped, not estimated.",
      "The plan flag covers a whole filing and does not exist before 2023, so the planned-sales split is an upper bound and blank for older months.",
      "Backfill reaches only as far back as EDGAR's recent-filings list.",
    ],
  },
  depreciation: {
    status: "partial",
    collectors: ["manual", "sec"],
    summary:
      "Changes to how long AMZN, META, GOOGL, MSFT, ORCL, CRWV, NBIS and IREN assume their servers last, with effective dates, cited from filings. Depreciation costs from SEC filings.",
    gaps: [
      "Disclosures are rarely GPU-specific. Some changes cover only some servers (e.g. Amazon 2025).",
      "Applied Digital and Core Scientific give only ranges.",
      "Comparing book value with resale value needs per-model resale prices, which aren't available.",
    ],
  },
};

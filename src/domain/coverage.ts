import type { IndicatorId } from "./types";

export type CoverageStatus = "implemented" | "partial" | "unavailable";

// Hand-maintained: what each indicator can and cannot show, and why.
// Mirrored in docs/coverage.md.
export const COVERAGE: Record<
  IndicatorId,
  { status: CoverageStatus; collectors: string[]; summary: string; gaps: string[] }
> = {
  gpu_rental: {
    status: "unavailable",
    collectors: [],
    summary:
      "Marketplace prices are not collected: Vast.ai and Shadeform terms prohibit automated collection for price indexes without written permission.",
    gaps: [
      "Vast.ai terms (Sep 2026) forbid using pricing data to build or maintain any pricing index or price-comparison database.",
      "Shadeform terms (Aug 2026) forbid systematic retrieval to create databases without written permission.",
      "Hyperscaler list-price APIs are being evaluated as a weaker proxy (list prices, no inventory).",
    ],
  },
  gpu_resale: {
    status: "unavailable",
    collectors: [],
    summary:
      "Under research: published resale indices are being checked for terms and methodology.",
    gaps: ["No free, licensed, transaction-level resale dataset is known."],
  },
  credit: {
    status: "partial",
    collectors: ["fred"],
    summary:
      "Index spreads by rating (ICE BofA via FRED) and long-history Moody's Baa context are automated daily.",
    gaps: [
      "ICE BofA history on FRED is limited to a rolling 3 years; older values exist only if collected here.",
      "Per-bond prices and yields for AI issuers need FINRA TRACE access, which requires an account.",
    ],
  },
  capex_cashflow: {
    status: "partial",
    collectors: [],
    summary: "SEC XBRL collector in progress.",
    gaps: [],
  },
  customer_concentration: {
    status: "partial",
    collectors: [],
    summary: "Manual, cited entries from filings (in progress).",
    gaps: ["Concentration is disclosed in text, not as structured data."],
  },
  construction: {
    status: "partial",
    collectors: [],
    summary: "Manual, cited entries from CBRE and JLL reports (in progress).",
    gaps: ["Broker reports are not published as datasets; entries are manual."],
  },
  vacancy: {
    status: "partial",
    collectors: [],
    summary: "Manual, cited entries from CBRE and JLL reports (in progress).",
    gaps: ["Broker reports are not published as datasets; entries are manual."],
  },
  contract_conversion: {
    status: "partial",
    collectors: [],
    summary: "SEC XBRL collector in progress (RPO, revenue, receivables).",
    gaps: [],
  },
  depreciation: {
    status: "partial",
    collectors: [],
    summary: "Manual, cited useful-life changes from 10-K/10-Q filings (in progress).",
    gaps: ["Disclosures are rarely GPU-specific."],
  },
};

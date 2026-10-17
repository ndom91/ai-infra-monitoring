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

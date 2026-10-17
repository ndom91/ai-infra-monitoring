import { SEC_COMPANIES, type SecCompany } from "~/domain/companies";
import type { IndicatorId, ObservationInput, SeriesDef } from "~/domain/types";
import { classify, permanent } from "../errors";
import type { CollectContext, CollectOutput, Collector } from "../types";
import {
  type CompanyFacts,
  filingIndexUrl,
  hasPeriodicFilings,
  instants,
  type Point,
  parseCompanyFacts,
  quarterlyFlows,
  tagLabel,
  usdFacts,
} from "./companyfacts";

export { type CompanyGroup, SEC_COMPANIES, type SecCompany } from "~/domain/companies";

type Concept = {
  id: string;
  label: string;
  indicator: IndicatorId;
  type: "flow" | "instant";
  // A negative derived quarter for these means the two inputs are on
  // different bases (e.g. FY restated for discontinued operations, 9M not).
  nonNegative?: boolean;
  // Each candidate is a list of us-gaap tags that are summed. Companies use
  // different tags and switch tags over time, so all candidates are tried.
  candidates: string[][];
  definition: string;
};

// Revenue feeds both capex/cash-flow ratios and contract conversion; it is
// filed under contract_conversion because RPO conversion is its main use.
export const CONCEPTS: Concept[] = [
  {
    id: "capex",
    label: "capital expenditure",
    indicator: "capex_cashflow",
    type: "flow",
    nonNegative: true,
    candidates: [
      ["PaymentsToAcquirePropertyPlantAndEquipment"],
      ["PaymentsToAcquireProductiveAssets"],
      ["PaymentsForCapitalImprovements"],
    ],
    definition:
      "Cash paid for property and equipment from the cash-flow statement. Excludes assets acquired under finance leases.",
  },
  {
    id: "ocf",
    label: "operating cash flow",
    indicator: "capex_cashflow",
    type: "flow",
    candidates: [["NetCashProvidedByUsedInOperatingActivities"]],
    definition: "Net cash provided by (used in) operating activities.",
  },
  {
    id: "revenue",
    label: "revenue",
    indicator: "contract_conversion",
    type: "flow",
    nonNegative: true,
    candidates: [
      ["Revenues"],
      ["RevenueFromContractWithCustomerExcludingAssessedTax"],
      ["RevenueFromContractWithCustomerIncludingAssessedTax"],
    ],
    definition: "Total reported revenue.",
  },
  {
    id: "da",
    label: "depreciation & amortization",
    indicator: "capex_cashflow",
    type: "flow",
    nonNegative: true,
    candidates: [
      ["DepreciationDepletionAndAmortization"],
      ["DepreciationAndAmortization"],
      ["DepreciationAmortizationAndAccretionNet"],
      ["Depreciation"],
    ],
    definition:
      "Depreciation and amortization expense. Some companies only tag depreciation (check the tag below); the scope then excludes amortization of intangibles.",
  },
  {
    id: "interest_expense",
    label: "interest expense",
    indicator: "capex_cashflow",
    type: "flow",
    nonNegative: true,
    candidates: [["InterestExpense"], ["InterestExpenseNonoperating"], ["InterestExpenseDebt"]],
    definition:
      "Interest expense recognized in the income statement (accrual basis, net of capitalized interest where the company reports it that way).",
  },
  {
    id: "interest_paid",
    label: "cash interest paid",
    indicator: "capex_cashflow",
    type: "flow",
    nonNegative: true,
    candidates: [["InterestPaidNet"], ["InterestPaid"]],
    definition:
      "Cash paid for interest from the supplemental cash-flow disclosure. Many companies disclose it only annually, which yields no quarterly series.",
  },
  {
    id: "debt",
    label: "long-term debt incl. current portion",
    indicator: "capex_cashflow",
    type: "instant",
    candidates: [
      ["LongTermDebt"],
      ["LongTermDebtNoncurrent", "LongTermDebtCurrent"],
      ["LongTermNotesAndLoans", "NotesPayableCurrent"],
      ["LongTermNotesPayable", "NotesPayableCurrent"],
    ],
    definition:
      "Carrying value of long-term debt including the current portion. When no total is tagged, the non-current and current tags are summed (kind 'calculated'). Excludes lease liabilities and commercial paper.",
  },
  {
    id: "finance_leases",
    label: "finance lease liabilities",
    indicator: "capex_cashflow",
    type: "instant",
    candidates: [
      ["FinanceLeaseLiability"],
      ["FinanceLeaseLiabilityNoncurrent", "FinanceLeaseLiabilityCurrent"],
    ],
    definition: "Present value of finance lease liabilities, current plus non-current.",
  },
  {
    id: "operating_leases",
    label: "operating lease liabilities",
    indicator: "capex_cashflow",
    type: "instant",
    candidates: [
      ["OperatingLeaseLiability"],
      ["OperatingLeaseLiabilityNoncurrent", "OperatingLeaseLiabilityCurrent"],
    ],
    definition:
      "Present value of operating lease liabilities, current plus non-current. Leases signed but not yet commenced are excluded.",
  },
  {
    id: "rpo",
    label: "remaining performance obligations",
    indicator: "contract_conversion",
    type: "instant",
    candidates: [["RevenueRemainingPerformanceObligation"]],
    definition:
      "Contracted revenue not yet recognized (ASC 606 remaining performance obligations).",
  },
  {
    id: "ar",
    label: "accounts receivable",
    indicator: "contract_conversion",
    type: "instant",
    candidates: [["AccountsReceivableNetCurrent"]],
    definition: "Accounts receivable, net of allowances, current.",
  },
  {
    id: "cash",
    label: "cash & equivalents",
    indicator: "capex_cashflow",
    type: "instant",
    candidates: [["CashAndCashEquivalentsAtCarryingValue"]],
    definition: "Cash and cash equivalents. Excludes marketable securities and restricted cash.",
  },
];

const FLOW_RULES =
  "Discrete quarters only, using actual period dates (not fiscal labels). Facts with a ~3-month duration are used directly (kind 'reported'). Missing quarters are derived as the difference of two cumulative facts with the same start date (6M - 3M, 9M - 6M, FY - 9M) or as FY minus the three preceding quarters (kind 'calculated', see note). Cash-flow items are usually only reported year-to-date, so most of their quarters are derived. For items that cannot be negative (capex, revenue, D&A, interest), a negative derived quarter is dropped rather than published: it means the inputs were reported on different bases (e.g. a restated fiscal year minus an unrestated 9-month figure).";
const INSTANT_RULES = "Balance-sheet value at the period-end date (periodStart = periodEnd).";
const COMMON_RULES =
  "Source: SEC XBRL companyfacts API, 10-K/10-Q filings only (8-K recasts and 20-F/40-F excluded), USD as reported. When a period appears in several filings the most recently filed value wins (asOf = filing date, sourceUrl = filing index). Among candidate tags the one with the most recent data is used (ties: more quarters, then the listed order); older history under a different tag is not stitched in. The full history is fetched on every run, so --backfill makes no difference.";

export function secSeriesId(ticker: string, concept: string) {
  return `sec.${ticker}.${concept}`;
}

function edgarUrl(cik: number) {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-&dateb=&owner=include&count=40`;
}

export function companyFactsUrl(cik: number) {
  return `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`;
}

function pointsFor(cf: CompanyFacts, concept: Concept, tags: string[]) {
  const facts = tags.map((t) => usdFacts(cf, t));
  if (concept.type === "instant") return instants(facts, tags);
  // Flow candidates are single tags; summing durations is never needed.
  const points = quarterlyFlows(facts[0] ?? []);
  if (!concept.nonNegative) return points;
  return points.filter((p) => p.kind === "reported" || p.value >= 0);
}

// Prefer the candidate whose data is most current; a tag a company stopped
// using years ago would otherwise yield a stale series.
export function pickCandidate(cf: CompanyFacts, concept: Concept) {
  let best: { tags: string[]; points: Point[] } | undefined;
  for (const tags of concept.candidates) {
    const points = pointsFor(cf, concept, tags);
    const last = points.at(-1)?.periodEnd;
    if (!last) continue;
    const bestLast = best?.points.at(-1)?.periodEnd ?? "";
    if (!best || last > bestLast || (last === bestLast && points.length > best.points.length)) {
      best = { tags, points };
    }
  }
  return best;
}

export function companyOutput(cf: CompanyFacts, company: SecCompany, log: (msg: string) => void) {
  const series: SeriesDef[] = [];
  const observations: ObservationInput[] = [];
  for (const concept of CONCEPTS) {
    const picked = pickCandidate(cf, concept);
    if (!picked) {
      log(`${company.ticker}: no quarterly data for ${concept.id}`);
      continue;
    }
    const id = secSeriesId(company.ticker, concept.id);
    const tagText = picked.tags.map((t) => `us-gaap:${t} ("${tagLabel(cf, t)}")`).join(" + ");
    series.push({
      id,
      indicator: concept.indicator,
      label: `${company.ticker} ${concept.label}`,
      entity: company.ticker,
      source: "SEC EDGAR XBRL",
      sourceUrl: edgarUrl(company.cik),
      unit: "USD",
      currency: "USD",
      methodology: [
        concept.definition,
        `XBRL tag: ${tagText}.`,
        concept.type === "flow" ? FLOW_RULES : INSTANT_RULES,
        COMMON_RULES,
        `Company group: ${company.group}.`,
      ].join(" "),
      cadence: "quarterly",
      collector: "sec",
    });
    for (const p of picked.points) {
      observations.push({
        seriesId: id,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        value: p.value,
        kind: p.kind,
        asOf: p.asOf,
        sourceUrl: filingIndexUrl(company.cik, p.accn),
        note: p.note,
      });
    }
    log(
      `${company.ticker} ${concept.id}: ${picked.points.length} quarters via ${picked.tags.join("+")}`,
    );
  }
  return { series, observations };
}

// SEC allows 10 requests/second; requests are sequential with a small gap.
const REQUEST_GAP_MS = 150;

export function makeSecCollector(requestGapMs = REQUEST_GAP_MS): Collector {
  return {
    name: "sec",
    description:
      "SEC EDGAR XBRL fundamentals (capex, cash flow, debt, leases, RPO) for hyperscalers and neoclouds",
    // companyfacts always returns the full history, so backfill and
    // routine runs behave the same.
    collect: (ctx) => collectAll(ctx, requestGapMs),
  };
}

export const secCollector = makeSecCollector();

async function collectAll(
  { fetch, log }: CollectContext,
  requestGapMs: number,
): Promise<CollectOutput> {
  const out: Required<Pick<CollectOutput, "series" | "observations" | "failures">> = {
    series: [],
    observations: [],
    failures: [],
  };
  for (const [i, company] of SEC_COMPANIES.entries()) {
    if (i > 0 && requestGapMs > 0) {
      await new Promise((r) => setTimeout(r, requestGapMs));
    }
    try {
      const res = await fetch(companyFactsUrl(company.cik));
      const cf = parseCompanyFacts(await res.text());
      if (!hasPeriodicFilings(cf)) {
        throw permanent(
          `${cf.entityName} has no USD us-gaap facts from 10-K/10-Q filings (foreign filer on 20-F/40-F: annual only, no quarterly XBRL)`,
        );
      }
      const result = companyOutput(cf, company, log);
      out.series.push(...result.series);
      out.observations.push(...result.observations);
    } catch (err) {
      out.failures.push({ key: company.ticker, error: classify(err) });
    }
  }
  if (out.series.length === 0) {
    throw out.failures[0]?.error ?? permanent("no SEC series collected");
  }
  return out;
}

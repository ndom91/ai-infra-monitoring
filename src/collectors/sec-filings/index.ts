import * as v from "valibot";
import { SEC_FILING_COMPANIES, type SecCompany } from "~/domain/companies";
import { classify, permanent } from "../errors";
import type { CollectContext, CollectOutput, Collector, FilingEventInput } from "../types";

const RecentFilingsSchema = v.object({
  accessionNumber: v.array(v.string()),
  filingDate: v.array(v.string()),
  form: v.array(v.string()),
  acceptanceDateTime: v.optional(v.array(v.string())),
  reportDate: v.optional(v.array(v.string())),
  items: v.optional(v.array(v.string())),
  primaryDocument: v.optional(v.array(v.string())),
  primaryDocDescription: v.optional(v.array(v.string())),
});

const SubmissionsSchema = v.object({
  filings: v.object({ recent: RecentFilingsSchema }),
});

type Submissions = v.InferOutput<typeof SubmissionsSchema>;

const EVENT_FORMS = new Set([
  "8-K",
  "8-K/A",
  "6-K",
  "10-Q",
  "10-Q/A",
  "10-K",
  "10-K/A",
  "20-F",
  "20-F/A",
]);

export function submissionsUrl(cik: number) {
  return `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`;
}

export function filingUrl(cik: number, accession: string, primaryDocument?: string) {
  const directory = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replaceAll("-", "")}`;
  return primaryDocument ? `${directory}/${primaryDocument}` : `${directory}/`;
}

export function parseSubmissions(text: string): Submissions {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw permanent("submissions response is not JSON", err);
  }
  const result = v.safeParse(SubmissionsSchema, raw);
  if (!result.success) {
    throw permanent(
      `unexpected submissions shape: ${result.issues.map((issue) => issue.message).join(", ")}`,
    );
  }
  return result.output;
}

function isEventForm(form: string) {
  return EVENT_FORMS.has(form) || form.startsWith("424B") || form.startsWith("S-3");
}

export function filingEventsFor(submissions: Submissions, company: SecCompany): FilingEventInput[] {
  const recent = submissions.filings.recent;
  const events: FilingEventInput[] = [];
  for (const [index, accession] of recent.accessionNumber.entries()) {
    const form = recent.form[index];
    const filedAt = recent.filingDate[index];
    if (!accession || !form || !filedAt || !isEventForm(form)) continue;
    const primaryDocument = recent.primaryDocument?.[index];
    events.push({
      accession,
      ticker: company.ticker,
      company: company.name,
      form,
      filedAt,
      acceptedAt: recent.acceptanceDateTime?.[index],
      reportDate: recent.reportDate?.[index],
      items: recent.items?.[index],
      description: recent.primaryDocDescription?.[index],
      sourceUrl: filingUrl(company.cik, accession, primaryDocument),
    });
  }
  return events;
}

const REQUEST_GAP_MS = 150;

export function makeSecFilingsCollector(requestGapMs = REQUEST_GAP_MS): Collector {
  return {
    name: "sec_filings",
    description: "SEC EDGAR filing events for tracked hyperscalers and neoclouds",
    async collect({ fetch, log }: CollectContext): Promise<CollectOutput> {
      const filingEvents: FilingEventInput[] = [];
      const snapshots: NonNullable<CollectOutput["snapshots"]> = [];
      const failures: NonNullable<CollectOutput["failures"]> = [];
      for (const [index, company] of SEC_FILING_COMPANIES.entries()) {
        if (index > 0 && requestGapMs > 0)
          await new Promise((resolve) => setTimeout(resolve, requestGapMs));
        try {
          const response = await fetch(submissionsUrl(company.cik));
          const body = await response.text();
          const events = filingEventsFor(parseSubmissions(body), company);
          filingEvents.push(...events);
          snapshots.push({ contentType: "application/json", body });
          log(`${company.ticker}: ${events.length} filing events`);
        } catch (err) {
          failures.push({ key: company.ticker, error: classify(err) });
        }
      }
      if (filingEvents.length === 0 && failures.length === SEC_FILING_COMPANIES.length) {
        throw failures[0]?.error ?? permanent("no SEC filing events collected");
      }
      return { series: [], observations: [], filingEvents, snapshots, failures };
    },
  };
}

export const secFilingsCollector = makeSecFilingsCollector();

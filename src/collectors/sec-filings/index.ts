import { SEC_FILING_COMPANIES, type SecCompany } from "~/domain/companies";
import { classify } from "../errors";
import { filingUrl, parseSubmissions, type Submissions, submissionsUrl } from "../sec/edgar";
import type { CollectContext, CollectOutput, Collector, FilingEventInput } from "../types";

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

export const secFilingsCollector: Collector = {
  name: "sec_filings",
  description: "SEC EDGAR filing events for all tracked SEC companies",
  async collect({ fetch, log }: CollectContext): Promise<CollectOutput> {
    const filingEvents: FilingEventInput[] = [];
    const snapshots: NonNullable<CollectOutput["snapshots"]> = [];
    const failures: NonNullable<CollectOutput["failures"]> = [];
    for (const company of SEC_FILING_COMPANIES) {
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
    return { series: [], observations: [], filingEvents, snapshots, failures };
  },
};

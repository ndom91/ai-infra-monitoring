import { SEC_DEBT_COMPANIES, type SecCompany } from "~/domain/companies";
import type { ObservationInput, SeriesDef } from "~/domain/types";
import { classify, permanent } from "../errors";
import { inferCadence } from "../sec";
import { filingIndexUrl } from "../sec/companyfacts";
import { filingUrl, parseSubmissions, submissionsUrl } from "../sec-filings";
import type { CollectContext, CollectOutput, Collector } from "../types";
import {
  type DebtFact,
  findFilingFiles,
  METRICS,
  type Member,
  memberLabel,
  parseFilingIndex,
  parseInstance,
  parseLabels,
  slug,
} from "./instance";

// Per-instrument debt (each facility, note and loan) from the XBRL instance
// document of every 10-Q and 10-K.
//
// Source terms: SEC EDGAR is public-domain data with a declared User-Agent and
// a limit of 10 requests per second (https://www.sec.gov/developer). Requests
// are sequential with a 150 ms gap, like the other SEC collectors.

const REQUEST_GAP_MS = 150;
const FORMS = new Set(["10-Q", "10-K"]);
// Five filings always include a 10-K, whose prior-year comparatives give
// 10-K-only facts two points a year apart. With fewer, inferCadence would see
// one point, default to quarterly, and those series would be flagged stale.
const ROUTINE_FILINGS = 5;

type Filing = { accession: string; form: string; filedAt: string; primaryDocument?: string };

type Point = { value: number; filed: string; filing: Filing };

type Accumulator = {
  def: Omit<SeriesDef, "cadence">;
  points: Map<string, Point>;
};

function filingsOf(body: string, backfill: boolean) {
  const recent = parseSubmissions(body).filings.recent;
  const filings: Filing[] = [];
  for (const [index, accession] of recent.accessionNumber.entries()) {
    const form = recent.form[index];
    const filedAt = recent.filingDate[index];
    if (!form || !filedAt || !FORMS.has(form)) continue;
    filings.push({ accession, form, filedAt, primaryDocument: recent.primaryDocument?.[index] });
  }
  // Newest first, so a routine run takes the latest filings.
  filings.sort((a, b) => b.filedAt.localeCompare(a.filedAt));
  return backfill ? filings : filings.slice(0, ROUTINE_FILINGS);
}

function qualifierText(qualifiers: Member[], labels: Map<string, string>) {
  return qualifiers.map((q) => memberLabel(labels, q.member)).join(", ");
}

function methodology(fact: DebtFact, labels: Map<string, string>) {
  const concept = METRICS[fact.metric].concept;
  const qualifiers = fact.qualifiers.length
    ? ` Qualifiers kept as part of the series: ${fact.qualifiers.map((q) => `${q.axis} = ${memberLabel(labels, q.member)}`).join("; ")}.`
    : "";
  const unit = METRICS[fact.metric].percent
    ? "Rates are stored in percent: the filed decimal x 100 (reported)."
    : "USD amounts as filed; amounts in other currencies are not included.";
  return [
    `XBRL concept us-gaap:${concept} from the XBRL instance document of each 10-Q and 10-K, for the instrument ${fact.instrumentQName}.`,
    "Only facts tagged with a debt-instrument or credit-facility dimension are included; company totals are in the sec collector's debt series.",
    `The instrument is the member on DebtInstrumentAxis (or CreditFacilityAxis when that is absent); debt-type members on other axes are ignored.${qualifiers}`,
    unit,
    "Observation dates are the period end of each fact's context, which can be an event date as well as a quarter end. When several filings report the same date the most recently filed value wins.",
    "The instrument member is stored as filed. A company may rename a facility between filings, and renamed members are not joined into one series.",
  ].join(" ");
}

function seriesFor(
  company: SecCompany,
  fact: DebtFact,
  labels: Map<string, string>,
  filing: Filing,
): Accumulator["def"] {
  const quals = qualifierText(fact.qualifiers, labels);
  const instrument = memberLabel(labels, fact.instrumentQName);
  const id = [
    "sec_debt",
    company.ticker,
    slug(fact.instrument),
    ...(fact.qualifiers.length ? [fact.qualifiers.map((q) => slug(q.member)).join("-")] : []),
    fact.metric,
  ].join(".");
  const percent = METRICS[fact.metric].percent;
  return {
    id,
    indicator: "credit",
    // The " — " separator lets the credit page show the instrument alone.
    label: `${instrument}${quals ? ` (${quals})` : ""} — ${METRICS[fact.metric].label}`,
    entity: company.ticker,
    source: "SEC EDGAR XBRL instance",
    sourceUrl: filingIndexUrl(company.cik, filing.accession),
    unit: percent ? "%" : "USD",
    currency: percent ? undefined : "USD",
    methodology: methodology(fact, labels),
    collector: "sec_debt",
  };
}

export function makeSecDebtCollector(requestGapMs = REQUEST_GAP_MS): Collector {
  return {
    name: "sec_debt",
    description:
      "Per-instrument debt (carrying amount, face amount, stated and effective rates, spreads) from the XBRL filings of neoclouds and AI labs",
    async collect({ fetch, log, backfill }: CollectContext): Promise<CollectOutput> {
      const series: SeriesDef[] = [];
      const observations: ObservationInput[] = [];
      const failures: NonNullable<CollectOutput["failures"]> = [];
      let awaitingFilings = 0;
      let requests = 0;
      const get = async (url: string) => {
        if (requests++ > 0 && requestGapMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, requestGapMs));
        }
        return (await fetch(url)).text();
      };

      for (const company of SEC_DEBT_COMPANIES) {
        try {
          const filings = filingsOf(await get(submissionsUrl(company.cik)), backfill);
          if (filings.length === 0) {
            if (company.allowMissingPeriodicFilings) {
              awaitingFilings += 1;
              log(`${company.ticker}: awaiting first 10-K or 10-Q filing`);
              continue;
            }
            throw permanent(`no 10-Q or 10-K filings for ${company.ticker}`);
          }
          const acc = new Map<string, Accumulator>();
          let facts = 0;
          let noXbrl = 0;
          // Oldest first, so the latest filing wins on a repeated date and its
          // labels are the ones shown.
          for (const filing of filings.toReversed()) {
            const names = parseFilingIndex(
              await get(filingUrl(company.cik, filing.accession, "index.json")),
            );
            const files = findFilingFiles(names, filing.primaryDocument);
            if (!files.instance) {
              if (!files.hasXbrl) {
                noXbrl += 1;
                continue;
              }
              throw permanent(`no XBRL instance document in ${filing.form} ${filing.accession}`);
            }
            const base = filingUrl(company.cik, filing.accession);
            const parsed = parseInstance(await get(`${base}${files.instance}`));
            if (parsed.facts.length === 0) continue;
            const labels = files.labels
              ? parseLabels(await get(`${base}${files.labels}`))
              : new Map<string, string>();
            facts += parsed.facts.length;
            for (const fact of parsed.facts) {
              const def = seriesFor(company, fact, labels, filing);
              const entry = acc.get(def.id) ?? { def, points: new Map<string, Point>() };
              entry.def = def;
              entry.points.set(fact.periodEnd, { value: fact.value, filed: fact.filed, filing });
              acc.set(def.id, entry);
            }
          }

          for (const { def, points } of acc.values()) {
            const dates = [...points.keys()].sort();
            series.push({
              ...def,
              cadence: inferCadence(dates.map((periodEnd) => ({ periodEnd }))),
            });
            for (const periodEnd of dates) {
              const point = points.get(periodEnd);
              if (!point) continue;
              const percent = def.unit === "%";
              observations.push({
                seriesId: def.id,
                periodStart: periodEnd,
                periodEnd,
                value: point.value,
                kind: "reported",
                asOf: point.filing.filedAt,
                sourceUrl: filingIndexUrl(company.cik, point.filing.accession),
                note: `${point.filing.form} filed ${point.filing.filedAt}.${percent ? ` Filed as ${point.filed}.` : ""}`,
              });
            }
          }
          log(
            `${company.ticker}: ${filings.length} filings, ${facts} instrument facts, ${acc.size} series${noXbrl ? `, ${noXbrl} filings without XBRL skipped` : ""}`,
          );
        } catch (err) {
          // A company with any unreadable filing writes nothing, so a missing
          // filing cannot make an instrument look repaid or its history shorter.
          failures.push({ key: company.ticker, error: classify(err) });
        }
      }
      if (failures.length > 0 && failures.length === SEC_DEBT_COMPANIES.length - awaitingFilings) {
        throw failures[0]?.error ?? permanent("no SEC debt data collected");
      }
      return { series, observations, failures };
    },
  };
}

export const secDebtCollector = makeSecDebtCollector();

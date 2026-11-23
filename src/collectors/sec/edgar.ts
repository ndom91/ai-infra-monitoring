import * as v from "valibot";
import { permanent } from "../errors";

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
  filings: v.object({
    recent: RecentFilingsSchema,
    // Older filings spill into extra files when `recent` is full.
    files: v.optional(v.array(v.unknown())),
  }),
});

export type Submissions = v.InferOutput<typeof SubmissionsSchema>;

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

const DAY_MS = 86_400_000;

// Some items (purchase obligations, cash interest paid) are disclosed only in
// the 10-K for some companies. Labelling those "quarterly" would mark them
// stale for most of the year, so cadence follows the recent spacing of data.
export function inferCadence(points: { periodEnd: string }[]): "quarterly" | "annual" {
  const recent = points.slice(-4).map((p) => Date.parse(p.periodEnd));
  const gaps = recent.slice(1).map((t, i) => (t - (recent[i] ?? t)) / DAY_MS);
  if (gaps.length === 0) return "quarterly";
  const median = gaps.toSorted((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
  return median > 200 ? "annual" : "quarterly";
}

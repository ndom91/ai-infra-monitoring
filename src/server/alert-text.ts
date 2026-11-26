// Alert wording comes from the current rule config, not the copy stored with
// each event, so rewording a rule also updates alerts that already fired. The
// stored evidence stays untouched as the audit record. Each alert also gets
// its rule's input series from the same config.
// Bundled at build time: the YAML file is not deployed next to the server.
import * as v from "valibot";
import { parse } from "yaml";
import rawConfig from "../../data/alerts.config.yaml?raw";

const SEVERITIES = ["critical", "warning", "info"] as const;

const WordingSchema = v.object({
  rules: v.array(
    v.object({
      id: v.string(),
      description: v.string(),
      severity: v.picklist(SEVERITIES),
      // Change and level rules: the series they read.
      series: v.optional(v.string()),
      // Breadth rules only: the rules they count.
      rules: v.optional(v.array(v.string())),
      min_rules: v.optional(v.number()),
    }),
  ),
});

const RULES = v.parse(WordingSchema, parse(rawConfig)).rules;
const DESCRIPTIONS = new Map(RULES.map((r) => [r.id, r.description]));
const SERIES = new Map(RULES.map((r) => [r.id, r.series ?? null]));

// One line per rule for the Alerts page: what it watches, in the config's own
// plain words, and how many of its member rules a breadth rule needs.
export function ruleSummaries() {
  return SEVERITIES.flatMap((severity) =>
    RULES.filter((r) => r.severity === severity).map((r) => ({
      id: r.id,
      severity,
      description: r.description,
      needs:
        r.rules && r.min_rules ? `Needs at least ${r.min_rules} of: ${r.rules.join(", ")}` : null,
    })),
  );
}

type StoredAlert = {
  ruleId: string;
  message: string;
  evidence: { params: Record<string, number | string> };
};

export function withCurrentWording<T extends StoredAlert>(alerts: T[]) {
  return alerts.map((a) => {
    const stored = a.evidence.params.description;
    const current = DESCRIPTIONS.get(a.ruleId);
    // Rule removed from config: keep what was stored.
    const description = current ?? (typeof stored === "string" ? stored : a.message);
    const message =
      current && typeof stored === "string" ? a.message.replace(stored, current) : a.message;
    // The rule's input series travels with the alert, so a figure can tell
    // whether an alert is about it (see figureTone).
    return { ...a, description, message, ruleSeries: SERIES.get(a.ruleId) ?? null };
  });
}

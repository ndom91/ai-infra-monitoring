// Alert wording comes from the current rule config, not the copy stored with
// each event, so rewording a rule also updates alerts that already fired. The
// stored evidence stays untouched as the audit record.
// Bundled at build time: the YAML file is not deployed next to the server.
import * as v from "valibot";
import { parse } from "yaml";
import rawConfig from "../../data/alerts.config.yaml?raw";

const WordingSchema = v.object({
  rules: v.array(v.object({ id: v.string(), description: v.string() })),
});

const DESCRIPTIONS = new Map(
  v.parse(WordingSchema, parse(rawConfig)).rules.map((r) => [r.id, r.description]),
);

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
    return { ...a, description, message };
  });
}

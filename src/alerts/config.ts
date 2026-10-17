import { readFile } from "node:fs/promises";
import * as v from "valibot";
import { parse } from "yaml";

const Base = {
  id: v.pipe(v.string(), v.regex(/^[a-z0-9_]+$/)),
  description: v.string(),
  severity: v.picklist(["info", "warning", "critical"]),
  // Minimum days between events for the same rule and series.
  cooldown_days: v.optional(v.number(), 30),
};

// Fires when a series moves by at least `threshold` (in series units, or as a
// fraction when `relative`) over `window_days`.
const ChangeRule = v.object({
  ...Base,
  type: v.literal("change"),
  series: v.string(),
  window_days: v.number(),
  threshold: v.number(),
  relative: v.optional(v.boolean(), false),
  direction: v.picklist(["up", "down"]),
});

// Fires when the latest value is above/below a level.
const LevelRule = v.object({
  ...Base,
  type: v.literal("level"),
  series: v.string(),
  above: v.optional(v.number()),
  below: v.optional(v.number()),
});

// Fires when at least `min_rules` distinct other rules fired within `window_days`.
const BreadthRule = v.object({
  ...Base,
  type: v.literal("breadth"),
  rules: v.array(v.string()),
  min_rules: v.number(),
  window_days: v.number(),
});

export const RuleSchema = v.variant("type", [ChangeRule, LevelRule, BreadthRule]);
export const AlertConfigSchema = v.object({ rules: v.array(RuleSchema) });

export type Rule = v.InferOutput<typeof RuleSchema>;
export type ChangeRule = v.InferOutput<typeof ChangeRule>;
export type LevelRule = v.InferOutput<typeof LevelRule>;
export type BreadthRule = v.InferOutput<typeof BreadthRule>;

export const ALERT_CONFIG_PATH = "data/alerts.config.yaml";

export async function loadAlertConfig(path = ALERT_CONFIG_PATH) {
  const raw = parse(await readFile(path, "utf8"));
  const result = v.safeParse(AlertConfigSchema, raw);
  if (!result.success) {
    throw new Error(
      `invalid ${path}: ${result.issues.map((i) => `${v.getDotPath(i)}: ${i.message}`).join("; ")}`,
    );
  }
  return result.output;
}

// `series` may end in `*` to match every series with that prefix.
export function matchesSeries(pattern: string, id: string) {
  return pattern.endsWith("*") ? id.startsWith(pattern.slice(0, -1)) : pattern === id;
}

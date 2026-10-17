// Usage: pnpm check:manual [file.yaml...]  (default: every data/manual/*.yaml)
// Validates curated YAML without touching the database.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MANUAL_DIR, parseManualFile, toCollectOutput } from "~/collectors/manual";

const args = process.argv.slice(2);
const paths = args.length
  ? args
  : readdirSync(DEFAULT_MANUAL_DIR)
      .filter((n) => /\.ya?ml$/.test(n))
      .sort()
      .map((n) => join(DEFAULT_MANUAL_DIR, n));

try {
  const files = paths.map((p) => ({
    name: p,
    data: parseManualFile(p, readFileSync(p, "utf8")),
  }));
  toCollectOutput(files, new Date());
  for (const { name, data } of files) {
    const obs = data.series.flatMap((s) => s.observations);
    const ends = obs.map((o) => o.period_end).sort();
    console.log(
      `${name}: ${data.series.length} series, ${obs.length} observations, ${ends[0]} .. ${ends.at(-1)}`,
    );
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(2);
}

// Usage: pnpm db:restore <dir>
// Loads a backup into an EMPTY, migrated database (the target of
// TURSO_DATABASE_URL, or the local file). Refuses to write into a non-empty one.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { openDb } from "~/storage/db";
import { migrateDb } from "~/storage/migrate";

const TABLES = ["collector_runs", "series", "observations", "raw_snapshots", "alert_events"];

const dir = process.argv[2];
if (!dir) {
  console.error("usage: pnpm db:restore <backup dir>");
  process.exit(2);
}
const { db, client } = openDb();
await migrateDb(db);
const existing = await client.execute("select count(*) as n from observations");
if (Number(existing.rows[0]?.n ?? 0) > 0) {
  console.error("target database is not empty; refusing to restore");
  process.exit(2);
}

for (const table of TABLES) {
  const text = gunzipSync(await readFile(join(dir, `${table}.ndjson.gz`))).toString("utf8");
  const rows = text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  for (let i = 0; i < rows.length; i += 200) {
    await client.batch(
      rows.slice(i, i + 200).map((row) => {
        const cols = Object.keys(row);
        return {
          sql: `insert into ${table} (${cols.join(",")}) values (${cols.map(() => "?").join(",")})`,
          args: cols.map((c) => {
            const v = row[c] as { $b64?: string } | string | number | null;
            return v && typeof v === "object" && v.$b64
              ? Buffer.from(v.$b64, "base64")
              : (v as string | number | null);
          }),
        };
      }),
      "write",
    );
  }
  console.log(`${table}: ${rows.length} rows`);
}
client.close();

// Usage: pnpm db:backup [outDir]
// Writes every table as gzipped NDJSON. Restore with pnpm db:restore <dir>.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { openDb } from "~/storage/db";

export const TABLES = [
  "collector_runs",
  "series",
  "observations",
  "raw_snapshots",
  "alert_events",
] as const;

const outDir = process.argv[2] ?? "backup";
const PAGE = 5000;
const { client } = openDb();
await mkdir(outDir, { recursive: true });

for (const table of TABLES) {
  const lines: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await client.execute({
      sql: `select * from ${table} order by rowid limit ? offset ?`,
      args: [PAGE, offset],
    });
    for (const row of res.rows) {
      const obj: Record<string, unknown> = {};
      for (const col of res.columns) {
        const v = row[col];
        // Blobs (gzipped snapshots) are stored as base64 so the file stays text.
        obj[col] = v instanceof ArrayBuffer ? { $b64: Buffer.from(v).toString("base64") } : v;
      }
      lines.push(JSON.stringify(obj));
    }
    if (res.rows.length < PAGE) break;
  }
  await writeFile(join(outDir, `${table}.ndjson.gz`), gzipSync(`${lines.join("\n")}\n`));
  console.log(`${table}: ${lines.length} rows`);
}
client.close();

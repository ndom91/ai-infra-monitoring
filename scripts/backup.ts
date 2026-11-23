// Usage: pnpm db:backup [outDir]
// Writes every table as gzipped NDJSON. Restore with pnpm db:restore <dir>.
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { openDb } from "~/storage/db";
import { BACKUP_TABLES } from "~/storage/tables";

const outDir = process.argv[2] ?? "backup";
const PAGE = 5000;
const { client } = openDb();
await mkdir(outDir, { recursive: true });

for (const table of BACKUP_TABLES) {
  // Stream each page through gzip so a large table (raw_snapshots) is never
  // held in memory whole.
  const gzip = createGzip();
  const file = createWriteStream(join(outDir, `${table}.ndjson.gz`));
  gzip.pipe(file);
  let count = 0;
  for (let offset = 0; ; offset += PAGE) {
    const res = await client.execute({
      sql: `select * from ${table} order by rowid limit ? offset ?`,
      args: [PAGE, offset],
    });
    let chunk = "";
    for (const row of res.rows) {
      const obj: Record<string, unknown> = {};
      for (const col of res.columns) {
        const v = row[col];
        // Blobs (gzipped snapshots) are stored as base64 so the file stays text.
        obj[col] = v instanceof ArrayBuffer ? { $b64: Buffer.from(v).toString("base64") } : v;
      }
      chunk += `${JSON.stringify(obj)}\n`;
    }
    count += res.rows.length;
    if (chunk && !gzip.write(chunk)) {
      await new Promise<void>((resolve) => gzip.once("drain", resolve));
    }
    if (res.rows.length < PAGE) break;
  }
  gzip.end();
  await finished(file);
  console.log(`${table}: ${count} rows`);
}
client.close();

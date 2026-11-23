// Usage: pnpm db:restore <dir>
// Loads a backup into an EMPTY, migrated database (the target of
// TURSO_DATABASE_URL, or the local file). Refuses to write into a non-empty one.
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { openDb } from "~/storage/db";
import { migrateDb } from "~/storage/migrate";
import { BACKUP_TABLES } from "~/storage/tables";

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

const BATCH = 200;

async function insertRows(table: string, rows: Record<string, unknown>[]) {
  await client.batch(
    rows.map((row) => {
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

for (const table of BACKUP_TABLES) {
  const path = join(dir, `${table}.ndjson.gz`);
  if (!existsSync(path)) {
    // Backups made before a table was added to BACKUP_TABLES lack its file.
    console.warn(`${table}: no file in backup, skipped`);
    continue;
  }
  // Read line by line so a large table is never held in memory whole.
  const lines = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let batch: Record<string, unknown>[] = [];
  let count = 0;
  for await (const line of lines) {
    if (!line) continue;
    batch.push(JSON.parse(line) as Record<string, unknown>);
    count++;
    if (batch.length === BATCH) {
      await insertRows(table, batch);
      batch = [];
    }
  }
  if (batch.length) await insertRows(table, batch);
  console.log(`${table}: ${count} rows`);
}
client.close();

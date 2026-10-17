// Usage: pnpm collect <name...|all> [--backfill]
// Exit codes: 0 ok, 1 partial or transient failure, 2 permanent failure.
import { COLLECTORS } from "~/collectors/registry";
import { runCollector } from "~/collectors/runner";
import { openDb } from "~/storage/db";
import { migrateDb } from "~/storage/migrate";

const args = process.argv.slice(2);
const backfill = args.includes("--backfill");
const names = args.filter((a) => !a.startsWith("--"));

if (names.length === 0) {
  console.error(
    `usage: pnpm collect <${COLLECTORS.map((c) => c.name).join("|")}|all> [--backfill]`,
  );
  process.exit(2);
}

const selected =
  names[0] === "all"
    ? COLLECTORS
    : names.map((n) => {
        const c = COLLECTORS.find((c) => c.name === n);
        if (!c) {
          console.error(`unknown collector: ${n}`);
          process.exit(2);
        }
        return c;
      });

const { db, client } = openDb();
await migrateDb(db);

let exitCode = 0;
for (const collector of selected) {
  const res = await runCollector(db, collector, { backfill });
  if (res.status === "failed") {
    exitCode = Math.max(exitCode, res.error?.errorClass === "permanent" ? 2 : 1);
  } else if (res.status === "partial") {
    exitCode = Math.max(exitCode, 1);
  }
}
client.close();
process.exit(exitCode);

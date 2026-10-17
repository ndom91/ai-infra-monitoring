// Usage: pnpm alerts [--backtest]
import { runAlerts } from "~/alerts/run";
import { openDb } from "~/storage/db";

const { db, client } = openDb();
await runAlerts(db, { backtest: process.argv.includes("--backtest") });
client.close();

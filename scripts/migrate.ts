import { databaseUrl, openDb } from "~/storage/db";
import { migrateDb } from "~/storage/migrate";

const { db, client } = openDb();
await migrateDb(db);
console.log(`migrated ${databaseUrl().replace(/\/\/.*@/, "//")}`);
client.close();

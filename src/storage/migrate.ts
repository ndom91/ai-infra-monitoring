import { migrate } from "drizzle-orm/libsql/migrator";
import type { Db } from "./db";

export function migrateDb(db: Db) {
	return migrate(db, { migrationsFolder: "drizzle" });
}

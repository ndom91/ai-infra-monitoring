import { mkdirSync } from "node:fs";
import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

const LOCAL_URL = "file:data/local.db";

export function databaseUrl() {
  return process.env.TURSO_DATABASE_URL || LOCAL_URL;
}

export function openDb(url = databaseUrl()): { db: Db; client: Client } {
  if (url === LOCAL_URL) mkdirSync("data", { recursive: true });
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
  return { db: drizzle(client, { schema, casing: "snake_case" }), client };
}

// A client holds a per-client query queue. A request killed by the platform never releases its
// slot, so a client shared across Worker requests can deadlock every later request. Open a fresh
// one per call and never cache it at module level.
export function getDb() {
  return openDb().db;
}

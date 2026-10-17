import { defineConfig } from "drizzle-kit";

const url = process.env.TURSO_DATABASE_URL || "file:data/local.db";

export default defineConfig({
	schema: "./src/storage/schema.ts",
	out: "./drizzle",
	dialect: url.startsWith("file:") ? "sqlite" : "turso",
	casing: "snake_case",
	dbCredentials: { url, authToken: process.env.TURSO_AUTH_TOKEN },
});

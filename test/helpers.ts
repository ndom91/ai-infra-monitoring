import { openDb } from "~/storage/db";
import { migrateDb } from "~/storage/migrate";

export async function memoryDb() {
	const { db } = openDb(":memory:");
	await migrateDb(db);
	return db;
}

// Serves canned bodies by URL substring so collectors never hit the network.
export function fakeFetch(routes: Record<string, string | number>) {
	return async (url: string) => {
		for (const [needle, body] of Object.entries(routes)) {
			if (!url.includes(needle)) continue;
			if (typeof body === "number") {
				const { permanent, transient } = await import("~/collectors/errors");
				throw body >= 500
					? transient(`HTTP ${body}`)
					: permanent(`HTTP ${body}`);
			}
			return new Response(body);
		}
		throw new Error(`unexpected fetch ${url}`);
	};
}

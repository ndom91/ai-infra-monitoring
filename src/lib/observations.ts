import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import type { Dataset } from "./indicators";

const DATA_FILE = resolve(process.cwd(), "data/observations.json");

// Read on every request so `pnpm data:refresh` shows up without a rebuild.
export const getDataset = createServerFn({ method: "GET" }).handler(
	async (): Promise<Dataset> => {
		return JSON.parse(await readFile(DATA_FILE, "utf8"));
	},
);

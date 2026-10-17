// Refresh the FRED credit series in data/observations.json.
// Manually curated series are left untouched. On a FRED failure the
// last good observations are kept.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type Observation = { date: string; value: number; source: string };

const DATA_FILE = resolve(import.meta.dirname, "../data/observations.json");
const FRED_SERIES: Record<string, string> = {
	credit_hy: "BAMLH0A0HYM2",
	credit_ccc: "BAMLH0A3HYC",
};
const MAX_OBSERVATIONS = 1000;

async function fetchFred(seriesId: string): Promise<Observation[]> {
	const res = await fetch(
		`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`,
		{
			headers: { "User-Agent": "AIInfraMonitor/0.2 (personal research)" },
			signal: AbortSignal.timeout(40_000),
		},
	);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	// Header is "observation_date,<ID>"; FRED marks missing values with ".".
	const [, ...rows] = (await res.text()).trim().split(/\r?\n/);
	const out: Observation[] = [];
	for (const row of rows) {
		const [date, raw] = row.split(",");
		const value = Number(raw);
		if (!date || !raw || raw === "." || Number.isNaN(value)) continue;
		out.push({ date, value, source: "FRED / ICE BofA" });
	}
	if (out.length === 0) throw new Error("no observations");
	return out.slice(-MAX_OBSERVATIONS);
}

const dataset = JSON.parse(await readFile(DATA_FILE, "utf8"));
const failures: string[] = [];

for (const [key, seriesId] of Object.entries(FRED_SERIES)) {
	try {
		dataset.series[key] = await fetchFred(seriesId);
		console.log(`${key}: ${dataset.series[key].length} observations`);
	} catch (err) {
		failures.push(`${key}: ${(err as Error).message}`);
		console.warn(`WARNING ${failures.at(-1)}`);
	}
}

dataset.generated_at = new Date().toISOString();
await writeFile(DATA_FILE, `${JSON.stringify(dataset, null, 2)}\n`);
if (failures.length) console.warn(`Refresh warnings: ${failures.join("; ")}`);

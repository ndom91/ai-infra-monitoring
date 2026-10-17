import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { observations, series } from "~/storage/schema";
import { memoryDb } from "../../../test/helpers";
import { runCollector } from "../runner";
import {
	createManualCollector,
	DEFAULT_MANUAL_DIR,
	parseManualFile,
	toCollectOutput,
} from ".";

const FIXTURES = "test/fixtures/manual";
const NOW = new Date("2026-10-17T00:00:00Z");
const quiet = { log: () => {}, now: NOW };

const valid = await readFile(join(FIXTURES, "supply.yaml"), "utf8");

function expectReject(text: string, match: RegExp) {
	expect(() => parseManualFile("x.yaml", text)).toThrow(match);
	try {
		parseManualFile("x.yaml", text);
	} catch (err) {
		expect((err as { errorClass: string }).errorClass).toBe("permanent");
	}
}

describe("parseManualFile", () => {
	it("accepts a well-formed file and defaults kind to manual", () => {
		const f = parseManualFile("supply.yaml", valid);
		expect(f.series).toHaveLength(1);
		expect(f.series[0]?.observations[0]).toMatchObject({
			period_end: "2025-12-31",
			value: 1.6,
			kind: "manual",
		});
	});

	it("rejects an observation without a quote", () => {
		expectReject(
			valid.replace(/\n\s+quote: "Vacancy fell.*"/, ""),
			/observations\.0\.quote/,
		);
	});

	it("rejects an observation without a source_url", () => {
		expectReject(
			valid.replace(
				"        source_url: https://example.com/report/h2-2025\n",
				"",
			),
			/observations\.0\.source_url/,
		);
	});

	it("rejects calculated values without a derivation note", () => {
		expectReject(
			valid.replace("value: 1.6\n", "value: 1.6\n        kind: calculated\n"),
			/derivation/,
		);
	});

	it("rejects 'reported', unknown keys, bad dates and bad indicators", () => {
		expectReject(
			valid.replace("value: 1.6\n", "value: 1.6\n        kind: reported\n"),
			/kind/,
		);
		expectReject(
			valid.replace("value: 1.6\n", "value: 1.6\n        vlaue: 2\n"),
			/vlaue/,
		);
		expectReject(valid.replace("2025-12-31", "2025-13-31"), /period_end/);
		expectReject(valid.replace("2025-07-01", "2026-01-01"), /period_start/);
		expectReject(
			valid.replace("indicator: vacancy", "indicator: x"),
			/indicator/,
		);
		expectReject(valid.replace("value: 1.6", 'value: "1.6"'), /value/);
	});

	it("rejects invalid YAML and empty files", () => {
		expectReject("series: [", /invalid YAML/);
		expectReject("", /\(root\)/);
		expectReject("series: []", /series/);
	});
});

describe("toCollectOutput", () => {
	const file = parseManualFile("a.yaml", valid);

	it("maps to series defs and observations with the quote in the note", () => {
		const out = toCollectOutput([{ name: "a.yaml", data: file }], NOW);
		expect(out.series[0]).toMatchObject({
			id: "test.vacancy",
			sourceUrl: "https://example.com/report",
			collector: "manual",
			entity: "Test market",
		});
		expect(out.series[0]).not.toHaveProperty("currency");
		expect(out.observations[0]).toEqual({
			seriesId: "test.vacancy",
			periodStart: "2025-07-01",
			periodEnd: "2025-12-31",
			value: 1.6,
			kind: "manual",
			asOf: "2026-02-15",
			sourceUrl: "https://example.com/report/h2-2025",
			note: 'Source quote: "Vacancy fell to 1.6% in H2 2025."',
		});
	});

	it("rejects series ids reused across files", () => {
		expect(() =>
			toCollectOutput(
				[
					{ name: "a.yaml", data: file },
					{ name: "b.yaml", data: file },
				],
				NOW,
			),
		).toThrow(/already defined in a.yaml/);
	});

	it("rejects duplicate periods and future as_of dates", () => {
		const dup = parseManualFile(
			"d.yaml",
			valid
				.replace("period_start: 2026-01-01", "period_start: 2025-07-01")
				.replace("period_end: 2026-06-30", "period_end: 2025-12-31"),
		);
		expect(() => toCollectOutput([{ name: "d.yaml", data: dup }], NOW)).toThrow(
			/two observations ending 2025-12-31/,
		);
		expect(() =>
			toCollectOutput(
				[{ name: "a.yaml", data: file }],
				new Date("2026-03-01T00:00:00Z"),
			),
		).toThrow(/in the future/);
	});
});

describe("manualCollector", () => {
	it("loads every YAML file in the directory and is idempotent", async () => {
		const db = await memoryDb();
		const c = createManualCollector(FIXTURES);
		const first = await runCollector(db, c, quiet);
		expect(first).toMatchObject({ status: "ok", fetched: 3, inserted: 3 });
		const rows = await db.select().from(series);
		expect(rows.map((r) => r.id).sort()).toEqual([
			"test.useful_life",
			"test.vacancy",
		]);
		const [life] = await db
			.select()
			.from(observations)
			.where(eq(observations.seriesId, "test.useful_life"));
		expect(life).toMatchObject({ kind: "calculated", value: 5.5 });
		expect(life?.note).toMatch(/^Spelled-out number.*Source quote: "we/);

		const second = await runCollector(db, c, quiet);
		expect(second).toMatchObject({ status: "ok", inserted: 0, unchanged: 3 });
	});

	it("fails permanently on an invalid file and writes nothing", async () => {
		const dir = await mkdtemp(join(tmpdir(), "manual-"));
		await writeFile(join(dir, "ok.yaml"), valid);
		await writeFile(
			join(dir, "bad.yaml"),
			valid.replace("test.vacancy", "test.other").replace(/\n\s+quote: .*/, ""),
		);
		const db = await memoryDb();
		const res = await runCollector(db, createManualCollector(dir), quiet);
		expect(res.status).toBe("failed");
		expect(res.error?.errorClass).toBe("permanent");
		expect(res.error?.message).toMatch(/^bad\.yaml: .*quote/);
		expect(await db.select().from(observations)).toHaveLength(0);
	});

	it("fails permanently when the directory is missing or empty", async () => {
		const db = await memoryDb();
		const missing = await runCollector(
			db,
			createManualCollector("/nonexistent/manual"),
			quiet,
		);
		expect(missing.error?.errorClass).toBe("permanent");
		const empty = await runCollector(
			db,
			createManualCollector(await mkdtemp(join(tmpdir(), "manual-"))),
			quiet,
		);
		expect(empty.error?.message).toMatch(/no YAML files/);
	});

	it("accepts the committed data/manual files", async () => {
		const db = await memoryDb();
		const res = await runCollector(
			db,
			createManualCollector(DEFAULT_MANUAL_DIR),
			{ log: () => {} },
		);
		expect(res.error).toBeUndefined();
		expect(res.status).toBe("ok");
	});
});

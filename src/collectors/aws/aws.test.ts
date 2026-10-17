import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeFetch, memoryDb } from "../../../test/helpers";
import { runCollector } from "../runner";
import {
  AWS_INSTANCES,
  awsCollector,
  backfillVersions,
  extractAwsPrices,
  extractPriceList,
  parseCsvLine,
} from ".";

const current = readFileSync("test/fixtures/aws/us-east-1-current.csv", "utf8");
const aug2023 = readFileSync("test/fixtures/aws/us-east-1-20230905140324.csv", "utf8");
const versions = readFileSync("test/fixtures/aws/versions.json", "utf8");
const TYPES = AWS_INSTANCES.map((i) => i.instanceType);

async function* linesOf(text: string) {
  yield* text.split("\n");
}

function instance(type: string) {
  const i = AWS_INSTANCES.find((x) => x.instanceType === type);
  if (!i) throw new Error(type);
  return i;
}

async function pricesFrom(text: string, type: string) {
  const extract = await extractPriceList(linesOf(text), TYPES);
  const prices = extractAwsPrices(
    extract.rows.map((r) => r.fields),
    instance(type),
  );
  return Object.fromEntries(prices.map((p) => [p.priceType, p]));
}

describe("parseCsvLine", () => {
  it("handles quoted commas and escaped quotes", () => {
    expect(parseCsvLine('"a","b,c","d ""e""",""')).toEqual(["a", "b,c", 'd "e"', ""]);
  });
});

describe("extractPriceList", () => {
  it("reads metadata and keeps only tracked instance rows", async () => {
    const extract = await extractPriceList(linesOf(current), TYPES);
    expect(extract.version).toBe("20261015191316");
    expect(extract.publicationDate).toBe("2026-10-15T19:13:16Z");
    expect(extract.preamble).toHaveLength(6);
    // The fixture includes three unrelated rows from the top of the real file.
    const dataLines = current.trim().split("\n").length - 6;
    expect(extract.rows.length).toBe(dataLines - 3);
    expect(extract.rows.every((r) => TYPES.includes(r.fields["Instance Type"] ?? ""))).toBe(true);
  });

  it("rejects files without the expected header", async () => {
    await expect(extractPriceList(linesOf("<html>nope</html>"), TYPES)).rejects.toThrow(/header/);
  });
});

describe("extractAwsPrices", () => {
  it("normalizes the Linux on-demand price per GPU and nothing else", async () => {
    const p5 = await pricesFrom(current, "p5.48xlarge");
    // The fixture also has reserved-instance rows; only on-demand is tracked.
    expect(Object.keys(p5)).toEqual(["ondemand"]);
    expect(p5.ondemand?.instancePerHour).toBe(55.04);
    expect(p5.ondemand?.perGpuHour).toBeCloseTo(6.88, 6);

    const p5en = await pricesFrom(current, "p5en.48xlarge");
    expect(p5en.ondemand?.perGpuHour).toBeCloseTo(63.296 / 8, 6);
  });

  it("ignores capacity blocks, other OSes and dedicated tenancy", async () => {
    // The fixture has $0.00 capacity-block rows and RHEL/SUSE/dedicated variants.
    for (const type of TYPES) {
      const prices = await pricesFrom(current, type);
      expect(prices.ondemand?.instancePerHour ?? 0).toBeGreaterThan(10);
    }
  });

  it("reads older files that predate the MarketOption column", async () => {
    const p5 = await pricesFrom(aug2023, "p5.48xlarge");
    expect(p5.ondemand?.instancePerHour).toBe(98.32);
    const h200 = await pricesFrom(aug2023, "p5en.48xlarge");
    expect(h200.ondemand).toBeUndefined();
  });

  it("rejects two different on-demand prices for one instance", async () => {
    const line = current.split("\n").find((l) => l.includes("$55.04 per On Demand Linux"));
    if (!line) throw new Error("fixture lacks p5 on-demand row");
    const doctored = `${current}\n${line.replace(/"55\.0400000000"/, '"1.0000000000"')}`;
    await expect(pricesFrom(doctored, "p5.48xlarge")).rejects.toThrow(/ambiguous/);
  });
});

describe("backfillVersions", () => {
  it("keeps closed monthly versions since the cutoff", () => {
    expect(backfillVersions(JSON.parse(versions), "2020-11-01")).toEqual([
      { version: "20230905140324", start: "2023-08-01", end: "2023-08-31" },
    ]);
    expect(backfillVersions(JSON.parse(versions), "2024-01-01")).toEqual([]);
  });
});

describe("awsCollector", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  // Backfill covers the last 24 months, so the August 2023 fixture is in range
  // only when "now" is mid-2025.
  const backfillNow = new Date("2025-06-01T12:00:00Z");

  it("records today's per-GPU prices and a trimmed snapshot", async () => {
    const out = await awsCollector.collect({
      backfill: false,
      now,
      fetch: fakeFetch({ "current/us-east-1": current }) as never,
      log: () => {},
    });
    expect(out.failures).toEqual([]);
    expect(out.series.map((s) => s.id).sort()).toEqual([
      "aws.h100.us-east-1.ondemand",
      "aws.h200.us-east-1.ondemand",
    ]);
    const h100 = out.observations.find((o) => o.seriesId === "aws.h100.us-east-1.ondemand");
    expect(h100).toMatchObject({ value: 6.88, kind: "calculated", periodEnd: "2026-10-17" });
    expect(h100?.asOf).toBe("2026-10-15");
    expect(h100?.note).toMatch(/55\.04 USD\/hr \/ 8 GPUs/);
    expect(out.snapshots).toHaveLength(1);
    expect(out.snapshots?.[0]?.body.length).toBeLessThan(current.length);
  });

  it("backfills monthly versions and persists through the runner", async () => {
    const db = await memoryDb();
    const res = await runCollector(db, awsCollector, {
      now: backfillNow,
      backfill: true,
      fetch: fakeFetch({
        "current/us-east-1": current,
        "20230905140324/us-east-1": aug2023,
        "AmazonEC2/index.json": versions,
      }) as never,
      log: () => {},
    });
    expect(res.status).toBe("ok");
    // Two series today, plus p5 (H100) for August 2023; p5en did not exist yet.
    expect(res.inserted).toBe(3);
  });

  it("is partial when a historical version fails", async () => {
    const db = await memoryDb();
    const res = await runCollector(db, awsCollector, {
      now: backfillNow,
      backfill: true,
      fetch: fakeFetch({
        "current/us-east-1": current,
        "20230905140324/us-east-1": 503,
        "AmazonEC2/index.json": versions,
      }) as never,
      log: () => {},
    });
    expect(res.status).toBe("partial");
    expect(res.failures.map((f) => f.key)).toEqual(["version:20230905140324"]);
  });
});

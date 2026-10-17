import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeFetch, memoryDb } from "../../../test/helpers";
import { runCollector } from "../runner";
import { FRED_SERIES, fredCollector, parseFredCsv } from ".";

const csv = readFileSync("test/fixtures/fred/BAMLH0A0HYM2.csv", "utf8");

describe("parseFredCsv", () => {
  it("parses a recorded FRED response", () => {
    const rows = parseFredCsv(csv, "BAMLH0A0HYM2");
    expect(rows.length).toBeGreaterThan(5);
    expect(rows[0]).toEqual({ date: "2026-09-25", value: expect.any(Number) });
  });

  it("skips missing markers and rejects schema drift", () => {
    const rows = parseFredCsv(
      "observation_date,X\n2026-01-01,1.5\n2026-01-02,.\n2026-01-03,\n",
      "X",
    );
    expect(rows).toEqual([{ date: "2026-01-01", value: 1.5 }]);
    expect(() => parseFredCsv("<html>oops</html>", "X")).toThrow(/header/);
    expect(() => parseFredCsv("observation_date,X\n2026-01-01,abc\n", "X")).toThrow(/non-numeric/);
  });
});

describe("fredCollector", () => {
  it("writes every series and marks a failing one as partial", async () => {
    const db = await memoryDb();
    const routes: Record<string, string | number> = {};
    for (const s of FRED_SERIES) {
      routes[`id=${s.id}&`] = csv.replace("BAMLH0A0HYM2", s.id);
    }
    routes["id=DGS10&"] = 503;
    const res = await runCollector(db, fredCollector, {
      fetch: fakeFetch(routes) as never,
      log: () => {},
    });
    expect(res.status).toBe("partial");
    expect(res.failures.map((f) => f.key)).toEqual(["DGS10"]);
    expect(res.failures[0]?.error.errorClass).toBe("transient");
    expect(res.inserted).toBe(parseFredCsv(csv, "BAMLH0A0HYM2").length * 8);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildingsStory,
  capexStory,
  capexToOcf,
  constructionStory,
  creditStory,
  fcfFromPeak,
  homeFigures,
  lastChange,
  neocloudStory,
  rentalStory,
  resaleStory,
  usd,
} from "./narrative";

const p = (periodEnd: string, value: number) => ({ periodEnd, value });

describe("narrative", () => {
  it("formats money for readers", () => {
    expect(usd(4.5e11)).toBe("$450 billion");
    expect(usd(-1.37e10)).toBe("−$14 billion");
    expect(usd(1.2e12)).toBe("$1.20 trillion");
  });

  it("writes the credit story from real year-ago values only", () => {
    const hy = [p("2025-10-15", 2.95), p("2026-10-15", 3.23)];
    const ccc = [p("2025-10-15", 8.47), p("2026-10-15", 12.78)];
    const s = creditStory(hy, ccc);
    expect(s?.headline).toBe(
      "Lending to the riskiest companies costs 431 basis points more than a year ago",
    );
    expect(s?.body.join(" ")).toMatch(/weakest borrowers/);
    // No point near a year back: no comparison, no story.
    expect(creditStory([p("2026-01-01", 3), p("2026-10-15", 3.2)], ccc)).toBeNull();
  });

  it("says when credit costs fell", () => {
    const s = creditStory(
      [p("2025-10-15", 4), p("2026-10-15", 3)],
      [p("2025-10-15", 12), p("2026-10-15", 9)],
    );
    expect(s?.headline).toMatch(/300 basis points less/);
  });

  it("writes the capex story with growth and the drop from peak", () => {
    const capex = [p("2025-06-30", 3e11), p("2026-06-30", 4.5e11)];
    const fcf = [p("2024-06-30", 2.4e11), p("2025-06-30", 2e11), p("2026-06-30", 1.2e11)];
    const s = capexStory(capex, fcf);
    expect(s?.headline).toBe(
      "Big tech spent $450 billion on data centers and equipment in a year, up 50%",
    );
    expect(s?.body[2]).toMatch(/50% below its peak of \$240 billion in June 2024/);
  });

  it("handles negative operating cash for neoclouds", () => {
    const s = neocloudStory("Acme", [p("2026-06-30", 1e10)], [p("2026-06-30", -1e9)], []);
    expect(s?.headline).toMatch(/burned cash/);
    const r = neocloudStory("Acme", [p("2026-06-30", 1e10)], [p("2026-06-30", 4e9)], []);
    expect(r?.headline).toBe("Acme is spending 2.5× the cash its business brings in");
  });

  it("describes GPU price moves in both directions", () => {
    const down = rentalStory([p("2024-10-31", 12.29), p("2026-10-17", 6.88)], []);
    expect(down?.headline).toBe(
      "Renting an Nvidia H100 on AWS costs 44% less than in October 2024",
    );
    const flat = rentalStory([p("2024-10-31", 6.88), p("2026-10-17", 6.88)], []);
    expect(flat?.headline).toMatch(/costs the same/);
    expect(
      lastChange([p("2024-01-01", 2), p("2024-02-01", 1), p("2024-03-01", 1)])?.to.periodEnd,
    ).toBe("2024-02-01");
  });

  it("writes resale and buildings stories, or nothing without data", () => {
    const idx = [p("2026-02-28", 98), p("2026-08-31", 75)];
    expect(resaleStory(idx)?.headline).toBe(
      "Used data-center GPUs resell for 23% less than six months ago",
    );
    expect(resaleStory([])).toBeNull();
    const b = buildingsStory([p("2026-06-30", 1.4)]);
    expect(b?.headline).toBe("Data centers are nearly full: only 1.4% of space is empty");
    expect(b?.body[0]).toMatch(/vacancy was 1.4%/);
    expect(buildingsStory([])).toBeNull();
  });

  it("writes the construction story with a year-ago change when one exists", () => {
    const c = constructionStory(
      [p("2025-06-30", 5242.5), p("2026-06-30", 7481.1)],
      [p("2026-06-30", 80.4)],
    );
    expect(c?.headline).toBe("7,481 MW is under construction, up 43% in a year");
    expect(c?.body[0]).toMatch(/7,481 megawatts.*up 43%/);
    expect(c?.body[1]).toMatch(/^80% of that new space/);
    expect(constructionStory([p("2026-06-30", 7481.1)], [])?.headline).toBe(
      "7,481 MW of data-center capacity is under construction",
    );
    expect(constructionStory([], [])).toBeNull();
  });
});

describe("shared figure helpers", () => {
  it("reports a free-cash-flow fall only beyond 10% and off the peak", () => {
    const fcf = [p("2025-06-30", 100), p("2025-12-31", 120), p("2026-06-30", 90)];
    expect(fcfFromPeak(fcf)?.drop).toBeCloseTo(0.25);
    expect(fcfFromPeak([p("2025-12-31", 100), p("2026-06-30", 95)])).toBeNull();
    expect(fcfFromPeak([p("2025-12-31", 90), p("2026-06-30", 100)])).toBeNull();
  });

  it("gives no capex ratio when operating cash flow is not positive", () => {
    expect(capexToOcf([p("2026-06-30", 10)], [p("2026-06-30", 4)])?.ratio).toBe(2.5);
    expect(capexToOcf([p("2026-06-30", 10)], [p("2026-06-30", -1)])?.ratio).toBeNull();
    expect(capexToOcf([p("2026-06-30", 10)], [p("2026-03-31", 4)])).toBeNull();
  });

  it("builds chapter figures and leaves out rows without data", () => {
    const f = homeFigures({
      credit: { hy: [], ccc: [p("2025-11-20", 9.2), p("2026-11-20", 14.02)] },
      capex: {
        capexTtm: [p("2025-09-30", 3.57e11), p("2026-09-30", 6.91e11)],
        fcfTtm: [p("2024-03-31", 2.5e11), p("2026-09-30", 3.3e10)],
      },
      neocloud: { capexTtm: [p("2026-09-30", 1e10)], ocfTtm: [p("2026-09-30", -1e9)] },
      rental: { aws: [] },
      resale: { index: [] },
      buildings: { vacancy: [], construction: [p("2026-06-30", 7481.1)], preleased: [] },
    });
    expect(f.borrow).toEqual([
      {
        label: "Riskiest companies (CCC-rated)",
        value: "14.02%",
        note: "Nov 20, 2026 · +482 bps in a year",
      },
    ]);
    expect(f.build.map((r) => r.value)).toEqual(["$691B", "$33B", "Cash flow negative"]);
    expect(f.build[0]?.note).toBe(
      "to Sep 30, 2026 · up from $357 billion a year earlier · calculated",
    );
    expect(f.build[1]?.note).toBe("87% below its March 2024 peak · calculated");
    expect(f.rent).toEqual([]);
    expect(f.fill).toEqual([{ label: "Under construction", value: "7,481 MW", note: "June 2026" }]);
  });
});

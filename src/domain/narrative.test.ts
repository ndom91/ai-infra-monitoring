import { describe, expect, it } from "vitest";
import {
  buildingsStory,
  capexStory,
  creditStory,
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
    expect(s?.body[1]).toMatch(/50% below its peak of \$240 billion in June 2024/);
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
    const b = buildingsStory(
      [p("2026-06-30", 1.4)],
      [p("2025-06-30", 5242.5), p("2026-06-30", 7481.1)],
      [p("2026-06-30", 80.4)],
    );
    expect(b?.headline).toBe("Data centers are nearly full: only 1.4% of space is empty");
    expect(b?.body[1]).toMatch(/7,481 megawatts.*up 43%/);
    expect(buildingsStory([], [], [])).toBeNull();
  });
});

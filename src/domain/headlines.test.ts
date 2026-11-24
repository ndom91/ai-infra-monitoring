import { describe, expect, it } from "vitest";
import { matchedYearChange } from "~/metrics/changes";
import {
  classifyIssuerDebt,
  groupMedianAtLatestQuarter,
  insiderWindow,
  issuedInstruments,
  issuedSummary,
  largestCustomerSeries,
  median,
} from "./headlines";

const series = (id: string, periodEnd: string, value: number) => ({
  id,
  label: `${id} label, coupon at issue`,
  sourceUrl: "https://example.test",
  points: [],
  latest: { periodEnd, value },
});

describe("classifyIssuerDebt", () => {
  it("classifies by series id", () => {
    expect(classifyIssuerDebt("issuer_debt.CRWV.ddtl_5_0.sofr_spread")).toBe("loan");
    expect(classifyIssuerDebt("issuer_debt.CRWV.revolver.sofr_spread")).toBe("loan");
    expect(classifyIssuerDebt("issuer_debt.IREN.conv_2033jun_1_00.coupon")).toBe("convertible");
    expect(classifyIssuerDebt("issuer_debt.CRWV.notes_2032_eur_8_50.coupon")).toBe("note");
    expect(classifyIssuerDebt("issuer_debt.CIFR.stingray_notes_2031_6_00.coupon")).toBe("note");
  });
});

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("issued instruments", () => {
  const list = issuedInstruments([
    series("issuer_debt.CRWV.notes_2030_9_25.coupon", "2025-05-27", 9.25),
    series("issuer_debt.CRWV.notes_2031_9_00.coupon", "2025-07-25", 9),
    series("issuer_debt.IREN.conv_2029_3_50.coupon", "2024-12-06", 3.5),
    series("issuer_debt.IREN.conv_2031_0_00.coupon", "2025-06-13", 0),
    series("issuer_debt.NBIS.conv_2030_1_00.coupon", "2025-06-02", 1),
    series("issuer_debt.CRWV.ddtl_5_0.sofr_spread", "2026-05-01", 4.5),
  ]);

  it("keeps deals since the cutoff, newest first, without the metric suffix", () => {
    expect(list.map((i) => i.id)).not.toContain("issuer_debt.IREN.conv_2029_3_50.coupon");
    expect(list[0]?.kind).toBe("loan");
    expect(list[0]?.title).toBe("issuer_debt.CRWV.ddtl_5_0.sofr_spread label");
    expect(list.find((i) => i.ticker === "NBIS")?.issuer).toBe("Nebius");
  });

  it("counts issuers and takes medians per kind, leaving loans out", () => {
    expect(issuedSummary(list)).toEqual({
      count: 5,
      issuers: 3,
      notes: { n: 2, median: 9.125 },
      convertibles: { n: 2, median: 0.5 },
    });
  });
});

describe("groupMedianAtLatestQuarter", () => {
  it("uses the latest quarter enough members reported", () => {
    const r = groupMedianAtLatestQuarter([
      [
        { periodEnd: "2026-03-31", value: 1 },
        { periodEnd: "2026-06-30", value: 2 },
      ],
      [
        { periodEnd: "2026-03-31", value: 3 },
        { periodEnd: "2026-06-30", value: 4 },
      ],
      // Has not reported Q2 yet, so Q2 has only two members.
      [{ periodEnd: "2026-04-02", value: 5 }],
    ]);
    expect(r).toEqual({ quarter: "2026-03-31", value: 3, n: 3 });
  });

  it("returns null when too few members report", () => {
    expect(groupMedianAtLatestQuarter([[{ periodEnd: "2026-03-31", value: 1 }]])).toBeNull();
  });
});

describe("matched-period year-over-year change", () => {
  it("rejects a stored change between different half-years", () => {
    const to = { periodEnd: "2026-06-30", value: 2 };
    const ok = { from: { periodEnd: "2025-06-30", value: 1 }, to, delta: 1, pct: 1 };
    const off = { from: { periodEnd: "2025-12-31", value: 1 }, to, delta: 1, pct: 1 };
    expect(matchedYearChange(ok)).toBe(ok);
    expect(matchedYearChange(off)).toBeNull();
    expect(matchedYearChange(null)).toBeNull();
  });
});

describe("insiderWindow", () => {
  const total = [
    { periodEnd: "2026-07-31", value: 50 },
    { periodEnd: "2026-09-30", value: 100 },
    { periodEnd: "2026-11-30", value: 300 },
  ];

  it("sums the last three calendar months and the planned share", () => {
    const planned = [
      { periodEnd: "2026-09-30", value: 100 },
      { periodEnd: "2026-11-30", value: 200 },
    ];
    expect(insiderWindow(total, planned, "2026-11")).toEqual({
      total: 400,
      months: 2,
      plannedShare: 0.75,
    });
  });

  it("gives no planned share when a month lacks the 10b5-1 flag", () => {
    const planned = [{ periodEnd: "2026-11-30", value: 200 }];
    expect(insiderWindow(total, planned, "2026-11").plannedShare).toBeNull();
  });

  it("crosses a year boundary", () => {
    expect(insiderWindow([{ periodEnd: "2025-12-31", value: 9 }], [], "2026-01").total).toBe(9);
  });
});

describe("largestCustomerSeries", () => {
  const s = (id: string, label = `${id} label`) => ({ id, label });

  it("prefers an explicit largest-customer series", () => {
    const list = [
      s("customer_concentration.CRWV.microsoft_pct_fy"),
      s("customer_concentration.CRWV.largest_customer_pct_fy"),
    ];
    expect(largestCustomerSeries(list, "fy")).toEqual({ series: list[1], customer: null });
  });

  it("uses the only named customer, with its name from the label", () => {
    const list = [
      s(
        "customer_concentration.CORZ.coreweave_pct_q",
        "Core Scientific revenue share from CoreWeave (quarter)",
      ),
      s("customer_concentration.CORZ.coreweave_pct_6m"),
    ];
    expect(largestCustomerSeries(list, "q")).toEqual({ series: list[0], customer: "CoreWeave" });
    expect(largestCustomerSeries(list, "fy")).toBeNull();
  });

  it("does not guess between several named customers", () => {
    const list = [
      s("customer_concentration.X.alpha_pct_q"),
      s("customer_concentration.X.beta_pct_q"),
      s("customer_concentration.X.top2_pct_q"),
    ];
    expect(largestCustomerSeries(list, "q")).toBeNull();
  });
});

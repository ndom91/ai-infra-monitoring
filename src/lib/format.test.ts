import { describe, expect, it } from "vitest";
import {
  CATEGORICAL,
  EMPHASIS,
  formatDate,
  formatDateTime,
  formatDelta,
  formatTick,
  formatValue,
  paletteFor,
  seriesStyle,
} from "./format";

describe("seriesStyle", () => {
  it("gives the first lap solid palette colours in order", () => {
    expect(seriesStyle(0)).toEqual({ color: CATEGORICAL[0] });
    expect(seriesStyle(CATEGORICAL.length - 1)).toEqual({ color: CATEGORICAL.at(-1) });
    expect(seriesStyle(1, "emphasis")).toEqual({ color: EMPHASIS[1] });
  });

  it("repeats colours dashed after the palette ends", () => {
    const first = seriesStyle(CATEGORICAL.length);
    expect(first.color).toBe(CATEGORICAL[0]);
    expect(first.dash).toBeDefined();
    const second = seriesStyle(CATEGORICAL.length * 2);
    expect(second.dash).toBeDefined();
    expect(second.dash).not.toEqual(first.dash);
  });

  it("starts both palettes with the white subject colour", () => {
    expect(EMPHASIS[0]).toBe("#f2f2f2");
    expect(CATEGORICAL[0]).toBe("#f2f2f2");
  });
});

describe("paletteFor", () => {
  it("emphasises up to three lines and goes categorical from four", () => {
    expect(paletteFor(1)).toBe("emphasis");
    expect(paletteFor(3)).toBe("emphasis");
    expect(paletteFor(4)).toBe("categorical");
  });
});

describe("formatDate", () => {
  it("spells every month with three letters", () => {
    expect(formatDate("2026-09-30")).toBe("30 Sep 2026");
    expect(formatDate("2026-01-05T10:00:00Z")).toBe("5 Jan 2026");
  });
});

describe("formatDateTime", () => {
  it("uses the day style and always says UTC", () => {
    expect(formatDateTime("2026-11-20T14:05:00Z")).toBe("20 Nov 2026, 14:05 UTC");
  });
});

describe("formatValue", () => {
  it("drops trailing zeros from percentages, keeping at most two decimals", () => {
    expect(formatValue(80.4, "%")).toBe("80.4%");
    expect(formatValue(14, "%")).toBe("14%");
    expect(formatValue(3.756, "%")).toBe("3.76%");
    expect(formatValue(1.4, "%")).toBe("1.4%");
  });

  it("shows days as whole numbers", () => {
    expect(formatValue(106.4, "days")).toBe("106 days");
  });

  it("writes megawatts in full with a thousands separator", () => {
    expect(formatValue(10900, "MW")).toBe("10,900 MW");
    expect(formatValue(7481.1, "MW")).toBe("7,481 MW");
  });

  it("uses a true minus sign for every negative value", () => {
    expect(formatValue(-2.5, "%")).toBe("−2.5%");
    expect(formatValue(-1200, "MW")).toBe("−1,200 MW");
    expect(formatValue(-3.84, "×")).toBe("−3.84×");
    expect(formatValue(-12, "days")).toBe("−12 days");
    expect(formatValue(-5, "index")).toBe("−5 index");
    expect(formatValue(-5e9, "USD")).toBe("−$5B");
  });

  it("leaves ratios and GPU-hour prices as they were", () => {
    expect(formatValue(3.84, "×")).toBe("3.84×");
    expect(formatValue(2.1, "USD/GPU-hr")).toBe("$2.10/hr");
  });
});

describe("formatTick", () => {
  it("keeps megawatt ticks compact and trims percent ticks", () => {
    expect(formatTick(10000, "MW")).toBe("10K MW");
    expect(formatTick(100, "%")).toBe("100%");
  });
});

describe("formatDelta", () => {
  it("trims percentage-point changes and uses a true minus", () => {
    expect(formatDelta({ delta: 1.4, pct: null } as never, "%")).toBe("+1.4 pp");
    expect(formatDelta({ delta: -0.25, pct: null } as never, "%")).toBe("−0.25 pp");
  });
});

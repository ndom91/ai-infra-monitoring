import { describe, expect, it } from "vitest";
import { formatDate, PALETTE, seriesStyle } from "./format";

describe("seriesStyle", () => {
  it("gives the first lap solid palette colours in order", () => {
    expect(seriesStyle(0)).toEqual({ color: PALETTE[0] });
    expect(seriesStyle(PALETTE.length - 1)).toEqual({ color: PALETTE.at(-1) });
  });

  it("repeats colours dashed after the palette ends", () => {
    const first = seriesStyle(PALETTE.length);
    expect(first.color).toBe(PALETTE[0]);
    expect(first.dash).toBeDefined();
    const second = seriesStyle(PALETTE.length * 2);
    expect(second.dash).toBeDefined();
    expect(second.dash).not.toEqual(first.dash);
  });

  it("keeps the original seven colours first", () => {
    expect(PALETTE.slice(0, 7)).toEqual([
      "#b5e1cd",
      "#f5c69c",
      "#9cc3f5",
      "#ffa49e",
      "#c9b5f0",
      "#e8dc9a",
      "#91a0a4",
    ]);
  });
});

describe("formatDate", () => {
  it("spells every month with three letters", () => {
    expect(formatDate("2026-09-30")).toBe("30 Sep 2026");
    expect(formatDate("2026-01-05T10:00:00Z")).toBe("5 Jan 2026");
  });
});

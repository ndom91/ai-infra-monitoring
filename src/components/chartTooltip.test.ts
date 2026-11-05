import { describe, expect, it } from "vitest";
import { sortTooltipDescending } from "./chartTooltip";

describe("sortTooltipDescending", () => {
  it("sorts numeric values from greatest to least, with missing values last", () => {
    const values = [null, -2, 9.94, 13.91, 11.46, 0, 13.91].map((y) => ({ parsed: { y } }));
    expect(values.sort(sortTooltipDescending).map((item) => item.parsed.y)).toEqual([
      13.91,
      13.91,
      11.46,
      9.94,
      0,
      -2,
      null,
    ]);
  });
});

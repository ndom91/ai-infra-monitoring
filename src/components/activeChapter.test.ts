import { describe, expect, it } from "vitest";
import { pickActiveChapter } from "./activeChapter";

const slugs = ["a", "b", "c"];
const none = new Set<string>();

describe("pickActiveChapter", () => {
  it("names the first chapter in the band", () => {
    expect(pickActiveChapter(slugs, new Set(["c", "b"]), [-900, -300, 200], 100, "a")).toBe("b");
  });

  it("names the first chapter while the reader is above it", () => {
    expect(pickActiveChapter(slugs, none, [480, 1500, 2500], 100, "c")).toBe("a");
  });

  it("prefers a chapter in the band over the first one", () => {
    expect(pickActiveChapter(slugs, new Set(["a"]), [500, 1500, 2500], 100, "c")).toBe("a");
  });

  it("names the last chapter that has passed the band in a gap between chapters", () => {
    expect(pickActiveChapter(slugs, none, [-900, -300, 400], 100, "c")).toBe("b");
  });

  it("does not trust a stale current chapter after a jump", () => {
    expect(pickActiveChapter(slugs, none, [-900, 395, 4000], 100, "c")).toBe("a");
  });

  it("keeps the current chapter when no chapter is on the page", () => {
    expect(pickActiveChapter(slugs, none, [null, null, null], 100, "b")).toBe("b");
  });

  it("treats a chapter whose top is exactly at the band as passed", () => {
    expect(pickActiveChapter(slugs, none, [-50, 100, 900], 100, "a")).toBe("b");
  });
});

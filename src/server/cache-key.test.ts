import { describe, expect, it } from "vitest";
import { PAGE_PARAMS } from "~/domain/page-params";
import { cacheKey } from "./cache-key";

const key = (path: string, build = "b1") => cacheKey(`https://example.com${path}`, build);

describe("cacheKey", () => {
  it("fills defaults for every page route", () => {
    expect(key("/")).toBe("https://cache.internal/b1/page?");
    expect(key("/market")).toBe("https://cache.internal/b1/page/market?range=3y");
    expect(key("/credit")).toBe("https://cache.internal/b1/page/credit?range=3y&company=CRWV");
    expect(key("/fundamentals")).toBe(
      "https://cache.internal/b1/page/fundamentals?range=5y&company=CRWV",
    );
    expect(key("/infrastructure")).toBe(
      "https://cache.internal/b1/page/infrastructure?range=max&topic=supply&publisher=cbre",
    );
    expect(key("/alerts")).toBe("https://cache.internal/b1/page/alerts?");
    expect(key("/coverage")).toBe("https://cache.internal/b1/page/coverage?");
  });

  it("covers every route in PAGE_PARAMS", () => {
    for (const path of Object.keys(PAGE_PARAMS)) {
      expect(key(path)).toContain("/page");
    }
  });

  it("gives one key to every spelling of the same page", () => {
    const keys = new Set(
      [
        "/credit",
        "/credit?range=3y",
        "/credit?company=CRWV&range=3y",
        "/credit?range=3y&company=CRWV&v=1",
        "/credit?utm_source=x#top",
      ].map((p) => key(p)),
    );
    expect(keys.size).toBe(1);
  });

  it("gives each page's plain URL and fully spelled-out default URL one key", () => {
    for (const [path, spec] of Object.entries(PAGE_PARAMS)) {
      const query = Object.entries(spec as Record<string, { default: string }>)
        .map(([name, p]) => `${name}=${p.default}`)
        .join("&");
      expect(key(query ? `${path}?${query}` : path)).toBe(key(path));
    }
  });

  it("drops unknown parameters, including on parameterless pages", () => {
    expect(key("/alerts?x=1")).toBe(key("/alerts"));
    expect(key("/?ref=a&b=2")).toBe(key("/"));
  });

  it("keeps different parameter values apart", () => {
    expect(key("/credit?company=IREN")).not.toBe(key("/credit"));
    expect(key("/credit?range=1y")).not.toBe(key("/credit"));
    expect(key("/infrastructure?topic=power")).not.toBe(key("/infrastructure"));
    expect(key("/infrastructure?publisher=jll")).not.toBe(key("/infrastructure"));
  });

  it("folds invalid values onto the default, as validateSearch does", () => {
    expect(key("/credit?range=junk&company=NOPE")).toBe(key("/credit"));
    expect(key("/credit?range=3")).toBe(key("/credit"));
  });

  it("falls back to the full URL for spellings the router might read differently", () => {
    expect(key('/credit?range="1y"')).toContain("/raw?url=");
    expect(key("/credit?range=1y&range=3y")).toContain("/raw?url=");
    expect(key('/credit?range="1y"')).not.toBe(key("/credit"));
  });

  it("keys other paths on the full URL", () => {
    const a = key("/_serverFn/abc?payload=1");
    expect(a).toBe(
      `https://cache.internal/b1/raw?url=${encodeURIComponent("https://example.com/_serverFn/abc?payload=1")}`,
    );
    expect(key("/_serverFn/abc?payload=2")).not.toBe(a);
    expect(key("/nope?a=1&b=2")).not.toBe(key("/nope?b=2&a=1"));
    expect(key("/credit/")).toContain("/raw?url=");
  });

  it("includes the build id", () => {
    expect(key("/credit", "b1")).not.toBe(key("/credit", "b2"));
    expect(key("/x", "b1")).not.toBe(key("/x", "b2"));
  });

  it("is a valid absolute URL for the Cache API", () => {
    for (const p of ["/", "/credit?company=IREN", "/_serverFn/a?b=c d", "/nope"]) {
      expect(() => new Request(key(p, "abc123"))).not.toThrow();
      expect(new URL(key(p)).protocol).toBe("https:");
    }
  });
});

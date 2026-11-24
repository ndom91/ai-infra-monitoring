import { beforeEach, describe, expect, it } from "vitest";
import { CACHE_CONTROL, FRESH_SECONDS, MAX_AGE_SECONDS } from "./cache-control";
import { type CacheDeps, cacheState, handleWithCache } from "./response-cache";

const MIN = 60_000;

describe("cacheState", () => {
  it("is fresh up to and including 20 minutes", () => {
    expect(cacheState(0)).toBe("fresh");
    expect(cacheState(FRESH_SECONDS * 1000)).toBe("fresh");
  });
  it("is stale just after 20 minutes, up to and including 6 hours", () => {
    expect(cacheState(FRESH_SECONDS * 1000 + 1)).toBe("stale");
    expect(cacheState(MAX_AGE_SECONDS * 1000)).toBe("stale");
  });
  it("is expired after 6 hours, or when the age is unusable", () => {
    expect(cacheState(MAX_AGE_SECONDS * 1000 + 1)).toBe("expired");
    expect(cacheState(Number.NaN)).toBe("expired");
  });
  it("matches the Cache-Control sent downstream", () => {
    expect(CACHE_CONTROL).toBe("public, s-maxage=1200, stale-while-revalidate=21600");
  });
});

// A cache that keeps stored responses by URL and hands out a fresh copy per match.
function fakeCache() {
  const store = new Map<string, { body: string; status: number; headers: [string, string][] }>();
  return {
    store,
    async match(r: Request) {
      const e = store.get(r.url);
      return e && new Response(e.body, { status: e.status, headers: e.headers });
    },
    async put(r: Request, res: Response) {
      store.set(r.url, { body: await res.text(), status: res.status, headers: [...res.headers] });
    },
  };
}

function setup(over: Partial<CacheDeps> = {}) {
  const cache = fakeCache();
  const pending: Promise<unknown>[] = [];
  const state = {
    clock: 1_000_000,
    version: "v1",
    renders: 0,
    versionReads: 0,
    headers: {} as Record<string, string>,
    status: 200,
  };
  const deps: CacheDeps = {
    cache,
    render: async () => {
      state.renders++;
      return new Response(`page ${state.version} #${state.renders}`, {
        status: state.status,
        headers: { "cache-control": CACHE_CONTROL, "content-type": "text/html", ...state.headers },
      });
    },
    dataVersion: async () => {
      state.versionReads++;
      return state.version;
    },
    now: () => state.clock,
    buildId: "b1",
    waitUntil: (p) => {
      pending.push(p);
    },
    ...over,
  };
  const req = (url = "https://example.com/credit") => handleWithCache(new Request(url), deps);
  const settle = async () => {
    await Promise.all(pending.splice(0));
  };
  return { cache, state, deps, req, settle };
}

const bodyOf = (r: Response) => r.text();

describe("handleWithCache", () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it("MISS then HIT", async () => {
    const a = await t.req();
    expect(a.headers.get("x-worker-cache")).toBe("MISS");
    expect(await bodyOf(a)).toBe("page v1 #1");
    await t.settle();
    const b = await t.req();
    expect(b.headers.get("x-worker-cache")).toBe("HIT");
    expect(await bodyOf(b)).toBe("page v1 #1");
    expect(t.state.renders).toBe(1);
    expect(t.state.versionReads).toBe(1);
  });

  it("shares one entry across spellings of the same page", async () => {
    await t.req("https://example.com/credit?range=3y&company=CRWV");
    await t.settle();
    const b = await t.req("https://example.com/credit?company=CRWV&range=3y&v=1");
    expect(b.headers.get("x-worker-cache")).toBe("HIT");
    const c = await t.req("https://example.com/credit?range=3y&company=IREN");
    expect(c.headers.get("x-worker-cache")).toBe("MISS");
  });

  it("never sends internal headers, and sends CACHE_CONTROL", async () => {
    await t.req();
    await t.settle();
    const [stored] = [...t.cache.store.values()];
    expect(stored?.headers.some(([k]) => k === "x-cache-rendered-at")).toBe(true);
    expect(Object.fromEntries(stored?.headers ?? [])["cache-control"]).toBe(
      `public, s-maxage=${MAX_AGE_SECONDS}`,
    );

    for (const advance of [0, 30 * MIN]) {
      t.state.clock += advance;
      const res = await t.req();
      expect([...res.headers.keys()].filter((k) => k.startsWith("x-cache-"))).toEqual([]);
      expect(res.headers.get("cache-control")).toBe(CACHE_CONTROL);
      expect(res.headers.get("content-type")).toBe("text/html");
      await t.settle();
    }
  });

  it("stale with an unchanged version: served stale, no render, entry re-stamped", async () => {
    await t.req();
    await t.settle();
    t.state.clock += 30 * MIN;
    const s = await t.req();
    expect(s.headers.get("x-worker-cache")).toBe("STALE");
    expect(await bodyOf(s)).toBe("page v1 #1");
    await t.settle();
    expect(t.state.renders).toBe(1);
    const next = await t.req();
    expect(next.headers.get("x-worker-cache")).toBe("HIT");
    expect(await bodyOf(next)).toBe("page v1 #1");
  });

  it("stale with a new version: served stale, renders once in the background", async () => {
    await t.req();
    await t.settle();
    t.state.clock += 30 * MIN;
    t.state.version = "v2";
    const s = await t.req();
    expect(s.headers.get("x-worker-cache")).toBe("STALE");
    expect(await bodyOf(s)).toBe("page v1 #1");
    await t.settle();
    expect(t.state.renders).toBe(2);
    const next = await t.req();
    expect(next.headers.get("x-worker-cache")).toBe("HIT");
    expect(await bodyOf(next)).toBe("page v2 #2");
  });

  it("two stale requests in a row trigger one revalidation", async () => {
    await t.req();
    await t.settle();
    t.state.clock += 30 * MIN;
    t.state.version = "v2";
    await t.req();
    await t.req();
    await t.settle();
    expect(t.state.renders).toBe(2);
    expect(t.state.versionReads).toBe(2);
  });

  it("allows another revalidation after one finishes or fails", async () => {
    await t.req();
    await t.settle();
    t.state.clock += 30 * MIN;
    t.deps.dataVersion = async () => {
      throw new Error("db down");
    };
    await t.req();
    await t.settle();
    t.deps.dataVersion = async () => "v1";
    await t.req();
    await t.settle();
    const next = await t.req();
    expect(next.headers.get("x-worker-cache")).toBe("HIT");
  });

  it("expired entries are rendered again", async () => {
    await t.req();
    await t.settle();
    t.state.clock += MAX_AGE_SECONDS * 1000 + 1;
    t.state.version = "v2";
    const r = await t.req();
    expect(r.headers.get("x-worker-cache")).toBe("MISS");
    expect(await bodyOf(r)).toBe("page v2 #2");
  });

  it("does not store non-200 or uncacheable responses", async () => {
    t.state.status = 404;
    expect((await t.req()).headers.get("x-worker-cache")).toBeNull();
    t.state.status = 302;
    await t.req();
    t.state.status = 200;
    const uncacheable: Record<string, string>[] = [
      { "cache-control": "private, s-maxage=600" },
      { "cache-control": "no-store" },
      { "cache-control": "public, max-age=10" },
      { "set-cookie": "a=b" },
    ];
    for (const h of uncacheable) {
      t.state.headers = h;
      const r = await t.req();
      expect(r.headers.get("x-worker-cache")).toBeNull();
    }
    await t.settle();
    expect(t.cache.store.size).toBe(0);
  });

  it("serves the page but stores nothing when the data version cannot be read on a miss", async () => {
    t.deps.dataVersion = async () => {
      throw new Error("db down");
    };
    const r = await t.req();
    expect(await bodyOf(r)).toBe("page v1 #1");
    await t.settle();
    expect(t.cache.store.size).toBe(0);
  });

  it("a throwing dataVersion during revalidation keeps the old entry and does not reject", async () => {
    await t.req();
    await t.settle();
    t.state.clock += 30 * MIN;
    t.deps.dataVersion = async () => {
      throw new Error("db down");
    };
    const s = await t.req();
    expect(s.headers.get("x-worker-cache")).toBe("STALE");
    await expect(t.settle()).resolves.toBeUndefined();
    expect(t.state.renders).toBe(1);
    t.state.clock += 1;
    expect(await bodyOf(await t.req())).toBe("page v1 #1");
  });

  it("a throwing render during revalidation keeps the old entry and does not reject", async () => {
    await t.req();
    await t.settle();
    t.state.clock += 30 * MIN;
    t.state.version = "v2";
    t.deps.render = async () => {
      throw new Error("render failed");
    };
    const s = await t.req();
    expect(await bodyOf(s)).toBe("page v1 #1");
    await expect(t.settle()).resolves.toBeUndefined();
    const again = await t.req();
    expect(again.headers.get("x-worker-cache")).toBe("STALE");
    expect(await bodyOf(again)).toBe("page v1 #1");
    await t.settle();
  });

  it("keeps the old entry when the revalidation render is not cacheable", async () => {
    await t.req();
    await t.settle();
    t.state.clock += 30 * MIN;
    t.state.version = "v2";
    t.state.status = 500;
    await t.req();
    await t.settle();
    t.state.status = 200;
    expect(await bodyOf(await t.req())).toBe("page v1 #1");
    await t.settle();
  });

  it("a new build id does not see the old build's entries", async () => {
    await t.req();
    await t.settle();
    t.deps.buildId = "b2";
    expect((await t.req()).headers.get("x-worker-cache")).toBe("MISS");
  });
});

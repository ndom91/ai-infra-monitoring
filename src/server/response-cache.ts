import { CACHE_CONTROL, FRESH_SECONDS, MAX_AGE_SECONDS } from "./cache-control";
import { cacheKey } from "./cache-key";

export type EdgeCache = {
  match(r: Request): Promise<Response | undefined>;
  put(r: Request, res: Response): Promise<void>;
};

export type CacheDeps = {
  cache: EdgeCache;
  render: (request: Request) => Promise<Response>;
  // Finish time of the newest collector run that wrote data.
  dataVersion: () => Promise<string>;
  now: () => number;
  buildId: string;
  waitUntil: (promise: Promise<unknown>) => void;
};

export type CacheState = "fresh" | "stale" | "expired";

// Internal bookkeeping on the stored copy; never sent to the client.
const RENDERED_AT = "x-cache-rendered-at";
const DATA_VERSION = "x-cache-data-version";

export function cacheState(ageMs: number): CacheState {
  if (!(ageMs <= MAX_AGE_SECONDS * 1000)) return "expired";
  return ageMs <= FRESH_SECONDS * 1000 ? "fresh" : "stale";
}

// Only 200s that opt in to shared caching via s-maxage. Server-function POSTs
// never qualify (GET only).
export function cacheable(res: Response) {
  const cc = res.headers.get("cache-control") ?? "";
  return (
    res.status === 200 &&
    /s-maxage=\d+/.test(cc) &&
    !/no-store|private/.test(cc) &&
    !res.headers.has("set-cookie")
  );
}

// Keys being revalidated in this isolate, so a burst of stale hits does the work once.
// It only skips duplicate work and nothing awaits it. The start time lets a key whose
// request was killed mid-revalidation (so `finally` never ran) become eligible again.
const revalidating = new Map<string, number>();
const REVALIDATION_TIMEOUT_MS = 60_000;

export async function handleWithCache(request: Request, deps: CacheDeps): Promise<Response> {
  const { cache, now } = deps;
  // Key on the page, not the request, so headers and URL spelling don't fragment the cache.
  const key = new Request(cacheKey(request.url, deps.buildId));

  const entry = await cache.match(key);
  if (entry) {
    // A missing or garbled timestamp reads as expired.
    const state = cacheState(now() - Number(entry.headers.get(RENDERED_AT)));
    if (state === "fresh") return forClient(entry, "HIT");
    if (state === "stale") {
      startRevalidation(request, key, deps);
      return forClient(entry, "STALE");
    }
  }

  // Read the version before rendering: if data lands mid-render the stamp is older
  // than the page, which only costs one extra revalidation. The other order could
  // stamp a page with a version it does not contain.
  const version = await deps.dataVersion().catch(() => null);
  const res = await deps.render(request);
  if (!cacheable(res)) return res;
  if (version !== null)
    deps.waitUntil(store(cache, key, res.clone(), version, now()).catch(() => {}));
  return tagMiss(res);
}

function startRevalidation(request: Request, key: Request, deps: CacheDeps) {
  const started = revalidating.get(key.url);
  if (started !== undefined && deps.now() - started < REVALIDATION_TIMEOUT_MS) return;
  revalidating.set(key.url, deps.now());
  deps.waitUntil(
    revalidate(request, key, deps)
      // A failed revalidation leaves the old entry in place; the next stale request retries.
      .catch(() => {})
      .finally(() => revalidating.delete(key.url)),
  );
}

async function revalidate(request: Request, key: Request, deps: CacheDeps) {
  const version = await deps.dataVersion();
  // Read the stored copy again instead of cloning the one being served, so a stale
  // hit that needs no revalidation work never pays for splitting its body.
  const current = await deps.cache.match(key);
  if (current?.headers.get(DATA_VERSION) === version) {
    // Same data, so the same page: keep the body, just restart the clock.
    await store(deps.cache, key, current, version, deps.now());
    return;
  }
  const res = await deps.render(request);
  if (cacheable(res)) await store(deps.cache, key, res, version, deps.now());
}

// The Cache API expires entries by the stored response's own Cache-Control, so the stored
// copy lives for the full window while the client copy keeps CACHE_CONTROL.
function store(cache: EdgeCache, key: Request, res: Response, version: string, at: number) {
  const out = new Response(res.body, res);
  out.headers.set("cache-control", `public, s-maxage=${MAX_AGE_SECONDS}`);
  out.headers.set(RENDERED_AT, String(at));
  out.headers.set(DATA_VERSION, version);
  return cache.put(key, out);
}

function forClient(entry: Response, state: "HIT" | "STALE") {
  const out = new Response(entry.body, entry);
  out.headers.delete(RENDERED_AT);
  out.headers.delete(DATA_VERSION);
  out.headers.set("cache-control", CACHE_CONTROL);
  out.headers.set("x-worker-cache", state);
  return out;
}

// Lets you confirm caching with curl: cf-cache-status is not set for Cache API hits.
function tagMiss(res: Response) {
  const out = new Response(res.body, res);
  out.headers.set("x-worker-cache", "MISS");
  return out;
}

import {
  createServerEntry,
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";

// TanStack Start picks up src/server.ts as the Worker entry. It is the default
// entry plus a Workers Cache API layer: responses already carry a shared-cache
// Cache-Control (see cache-control.ts), but Workers never use the CDN cache on
// their own, so every view would otherwise run its Turso queries again.
const start = createServerEntry({ fetch: createStartHandler(defaultStreamHandler) });

type WorkerCtx = { waitUntil(promise: Promise<unknown>): void };
type EdgeCache = {
  match(r: Request): Promise<Response | undefined>;
  put(r: Request, res: Response): Promise<void>;
};

// `caches.default` exists only in workerd, and caching in `vite dev` would
// serve stale pages while editing.
const edgeCache = (): EdgeCache | undefined =>
  import.meta.env.DEV
    ? undefined
    : (globalThis.caches as unknown as { default?: EdgeCache })?.default;

// Only 200s that opt in to shared caching via s-maxage; the cache expires them
// after that many seconds. Server-function POSTs never qualify (GET only).
function cacheable(res: Response) {
  const cc = res.headers.get("cache-control") ?? "";
  return (
    res.status === 200 &&
    /s-maxage=\d+/.test(cc) &&
    !/no-store|private/.test(cc) &&
    !res.headers.has("set-cookie")
  );
}

export default {
  async fetch(request: Request, env: unknown, ctx: WorkerCtx) {
    const cache = request.method === "GET" ? edgeCache() : undefined;
    if (!cache) return start.fetch(request, env as never);

    // Key on the URL alone so request headers don't fragment the cache.
    const key = new Request(request.url);
    const hit = await cache.match(key);
    if (hit) return tag(hit, "HIT");

    const res = await start.fetch(request, env as never);
    if (!cacheable(res)) return res;
    ctx.waitUntil(cache.put(key, res.clone()));
    return tag(res, "MISS");
  },
};

// Lets you confirm caching with curl: cf-cache-status is not set for Cache API hits.
function tag(res: Response, state: "HIT" | "MISS") {
  const out = new Response(res.body, res);
  out.headers.set("x-worker-cache", state);
  return out;
}

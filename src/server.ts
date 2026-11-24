import {
  createServerEntry,
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { type EdgeCache, handleWithCache } from "~/server/response-cache";
import { getDb } from "~/storage/db";
import { lastSuccessfulRun } from "~/storage/queries";

// Set at build time by vite.config.ts; never read from process.env at request time.
declare const __BUILD_ID__: string;

// TanStack Start picks up src/server.ts as the Worker entry. It is the default
// entry plus a Workers Cache API layer: responses already carry a shared-cache
// Cache-Control (see cache-control.ts), but Workers never use the CDN cache on
// their own, so every view would otherwise run its Turso queries again.
// The caching rules live in server/response-cache.ts.
const start = createServerEntry({ fetch: createStartHandler(defaultStreamHandler) });

type WorkerCtx = { waitUntil(promise: Promise<unknown>): void };

// `caches.default` exists only in workerd, and caching in `vite dev` would
// serve stale pages while editing.
const edgeCache = (): EdgeCache | undefined =>
  import.meta.env.DEV
    ? undefined
    : (globalThis.caches as unknown as { default?: EdgeCache })?.default;

export default {
  async fetch(request: Request, env: unknown, ctx: WorkerCtx) {
    const render = async (r: Request) => start.fetch(r, env as never);
    const cache = request.method === "GET" ? edgeCache() : undefined;
    if (!cache) return render(request);

    return handleWithCache(request, {
      cache,
      render,
      // A fresh database client per call; see getDb().
      dataVersion: async () => String(await lastSuccessfulRun(getDb())),
      now: Date.now,
      buildId: __BUILD_ID__,
      waitUntil: (p) => ctx.waitUntil(p),
    });
  },
};

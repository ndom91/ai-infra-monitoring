import { PAGE_PARAMS, type PagePath } from "~/domain/page-params";

const ORIGIN = "https://cache.internal";
// Anything outside this set might be parsed differently by the router (quoted JSON, say),
// so such a value is never folded onto a default.
const PLAIN_VALUE = /^[\w.-]*$/;

const isPagePath = (path: string): path is PagePath => Object.hasOwn(PAGE_PARAMS, path);

// The cache key is the page's identity: route plus the parameters it reads, with
// defaults filled in. Other spellings of the same page (parameter order, `v=1`,
// a spelled-out default) share one entry, so one render serves them all.
// The build id keeps a new deploy from serving pages that point at old asset files.
export function cacheKey(requestUrl: string, buildId: string): string {
  const url = new URL(requestUrl);
  const base = `${ORIGIN}/${encodeURIComponent(buildId)}`;
  if (isPagePath(url.pathname)) {
    const spec: Record<string, { default: string; allowed: readonly string[] }> =
      PAGE_PARAMS[url.pathname];
    const parts: string[] = [];
    for (const [name, p] of Object.entries(spec)) {
      const values = url.searchParams.getAll(name);
      const raw = values[0];
      // Repeated or oddly quoted values fall through to the full-URL key below.
      if (values.length > 1 || (raw !== undefined && !PLAIN_VALUE.test(raw))) {
        return rawKey(base, requestUrl);
      }
      parts.push(`${name}=${raw !== undefined && p.allowed.includes(raw) ? raw : p.default}`);
    }
    return `${base}/page${url.pathname === "/" ? "" : url.pathname}?${parts.join("&")}`;
  }
  return rawKey(base, requestUrl);
}

function rawKey(base: string, requestUrl: string) {
  return `${base}/raw?url=${encodeURIComponent(requestUrl)}`;
}

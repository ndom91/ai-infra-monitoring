import { permanent, transient } from "./errors";

export const USER_AGENT = process.env.SEC_USER_AGENT || "AIInfraMonitor nico.domino@plain.com";

export type FetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function fetchWithRetry(
  url: string,
  { headers, timeoutMs = 40_000, retries = 3, sleep = defaultSleep }: FetchOptions = {},
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastError = transient(`network error for ${url}`, err);
      continue;
    }
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      lastError = transient(`HTTP ${res.status} for ${url}`);
      continue;
    }
    throw permanent(`HTTP ${res.status} for ${url}`);
  }
  throw lastError ?? transient(`failed to fetch ${url}`);
}

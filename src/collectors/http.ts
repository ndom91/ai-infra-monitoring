import { permanent, transient } from "./errors";

const GENERIC_USER_AGENT = "AIInfraMonitor (+https://artificialliabilities.com)";

const isSecHost = (hostname: string) => hostname === "sec.gov" || hostname.endsWith(".sec.gov");

// The SEC requires a contact address in the User-Agent, so SEC_USER_AGENT is
// sent to sec.gov hosts only, and must be set for them. Every other host gets
// a generic User-Agent.
function userAgentFor(url: string): string {
  if (!isSecHost(new URL(url).hostname)) return GENERIC_USER_AGENT;
  const configured = process.env.SEC_USER_AGENT?.trim();
  if (!configured) {
    throw permanent(
      `SEC_USER_AGENT is not set; the SEC requires a contact address in the User-Agent for ${url}`,
    );
  }
  return configured;
}

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
  const userAgent = userAgentFor(url);
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": userAgent, ...headers },
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

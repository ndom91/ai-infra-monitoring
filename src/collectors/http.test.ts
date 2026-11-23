import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./http";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const sentUserAgent = (fetchMock: ReturnType<typeof stubFetch>) =>
  ((fetchMock.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> }).headers[
    "User-Agent"
  ];

describe("fetchWithRetry User-Agent", () => {
  it("sends SEC_USER_AGENT to SEC hosts", async () => {
    vi.stubEnv("SEC_USER_AGENT", "TestAgent configured-contact");
    const fetchMock = stubFetch();
    await fetchWithRetry("https://data.sec.gov/submissions/CIK0000000001.json");
    expect(sentUserAgent(fetchMock)).toBe("TestAgent configured-contact");
  });

  it("sends a generic User-Agent elsewhere, without needing SEC_USER_AGENT", async () => {
    vi.stubEnv("SEC_USER_AGENT", "");
    const fetchMock = stubFetch();
    await fetchWithRetry("https://api.stlouisfed.org/fred/series");
    expect(sentUserAgent(fetchMock)).toBe("AIInfraMonitor (+https://artificialliabilities.com)");
  });

  it("does not send SEC_USER_AGENT to lookalike hosts", async () => {
    vi.stubEnv("SEC_USER_AGENT", "TestAgent configured-contact");
    const fetchMock = stubFetch();
    await fetchWithRetry("https://notsec.gov.example.com/x");
    expect(sentUserAgent(fetchMock)).not.toContain("configured-contact");
  });

  it("fails permanently for an SEC host when SEC_USER_AGENT is unset", async () => {
    vi.stubEnv("SEC_USER_AGENT", "");
    const fetchMock = stubFetch();
    await expect(fetchWithRetry("https://www.sec.gov/cgi-bin/browse-edgar")).rejects.toMatchObject({
      errorClass: "permanent",
      message: expect.stringContaining("SEC_USER_AGENT"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchWithRetry SEC throttle", () => {
  it("spaces consecutive SEC requests, and leaves other hosts alone", async () => {
    vi.stubEnv("SEC_USER_AGENT", "TestAgent configured-contact");
    stubFetch();
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    await fetchWithRetry("https://data.sec.gov/a", { sleep });
    await fetchWithRetry("https://data.sec.gov/b", { sleep });
    // The second request always waits, whatever ran before in this process.
    const secWaits = waits.length;
    expect(secWaits).toBeGreaterThan(0);
    await fetchWithRetry("https://example.com/c", { sleep });
    expect(waits).toHaveLength(secWaits);
  });
});

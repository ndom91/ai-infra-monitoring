import { describe, expect, it } from "vitest";
import { outstandingDebt } from "./credit-debt";
import { buildView, type ObsPoint, type SeriesDefView } from "./views";

const NOW = new Date("2026-11-01T00:00:00Z");

const obs = (periodEnd: string, value: number): ObsPoint => ({
  id: 1,
  periodStart: periodEnd,
  periodEnd,
  value,
  kind: "reported",
  asOf: "2026-08-12",
  sourceUrl: "https://example.test/filing",
  note: "10-Q",
  quote: null,
});

const def = (id: string): SeriesDefView => ({
  id,
  indicator: "credit",
  label: `${id} label`,
  entity: id.split(".")[1] ?? null,
  source: "SEC",
  sourceUrl: "https://example.test",
  unit: "USD",
  currency: "USD",
  methodology: "long text",
  cadence: "quarterly",
  collector: "sec_debt",
});

const view = (id: string, points: ObsPoint[]) => buildView(def(id), points, { now: NOW });

describe("outstandingDebt", () => {
  const series = [
    view("sec_debt.CRWV.live.carrying_amount", [obs("2026-03-31", 5), obs("2026-06-30", 7)]),
    view("sec_debt.CRWV.repaid.carrying_amount", [obs("2026-03-31", 4)]),
    view("sec_debt.CRWV.zero.carrying_amount", [obs("2026-06-30", 0)]),
    view("sec_debt.CRWV.live.stated_rate", [obs("2026-03-31", 9), obs("2026-06-30", 10)]),
    view("sec_debt.CRWV.repaid.stated_rate", [obs("2026-03-31", 6)]),
    view("sec_debt.CRWV.live.other_metric", [obs("2026-06-30", 1)]),
    view("sec_debt.NBIS.live.carrying_amount", [obs("2026-06-30", 3)]),
  ];

  it("keeps instruments with a balance at the latest date, without methodology", () => {
    const { current } = outstandingDebt(series, "CRWV");
    expect(current.map((s) => s.id)).toEqual(["sec_debt.CRWV.live.carrying_amount"]);
    expect(current[0]?.methodology).toBeUndefined();
    expect(current[0]?.points).toHaveLength(2);
  });

  it("reduces rates of current instruments to their latest value", () => {
    const { rates } = outstandingDebt(series, "CRWV");
    expect(rates.map((s) => s.id)).toEqual(["sec_debt.CRWV.live.stated_rate"]);
    expect(rates[0]).toMatchObject({ points: [], latest: { value: 10 } });
    expect(rates[0]?.changes).toBeUndefined();
    expect(rates[0]?.methodology).toBeUndefined();
  });
});

describe("buildView payload", () => {
  it("omits kind for reported points and trims changes to dates and values", () => {
    const v = view("fred.X", [obs("2026-03-31", 1), obs("2026-06-30", 2)]);
    expect(v.points[0]).toEqual({ periodEnd: "2026-03-31", value: 1 });
    expect(v.latest).toEqual({
      periodEnd: "2026-06-30",
      value: 2,
      sourceUrl: "https://example.test/filing",
      note: "10-Q",
    });
    expect(v.changes?.prior?.from).toEqual({ periodEnd: "2026-03-31", value: 1 });
    expect(v.changes?.prior?.delta).toBe(1);
  });
});

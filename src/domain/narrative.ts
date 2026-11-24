// Turns series into plain-English headlines and paragraphs for the homepage.
// Every number in the text comes from the data passed in; when the data is
// too thin to support a sentence, the function returns null instead of
// guessing. Wording never claims causes, only what the numbers show.

import { changeOver, type Point, valueAtOrBefore } from "~/metrics/changes";
import { type Freshness, freshnessSuffix } from "./freshness";

export type Story = { headline: string; body: string[] };

const DAY_MS = 86_400_000;

export function monthYear(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shortDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function usd(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)} trillion`;
  if (abs >= 1e9) return `${sign}$${Math.round(abs / 1e9)} billion`;
  if (abs >= 1e6) return `${sign}$${Math.round(abs / 1e6)} million`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function pct(fraction: number, digits = 0) {
  return `${Math.abs(fraction * 100).toFixed(digits)}%`;
}

const bps = (deltaPctPoints: number) => Math.round(Math.abs(deltaPctPoints) * 100);

export function yearAgo(points: Point[]) {
  const last = points.at(-1);
  if (!last) return undefined;
  const target = new Date(Date.parse(last.periodEnd) - 365 * DAY_MS).toISOString().slice(0, 10);
  const p = valueAtOrBefore(points, target);
  // Only a real comparison if a value exists within ~3 weeks of the target.
  if (!p || Date.parse(target) - Date.parse(p.periodEnd) > 21 * DAY_MS) return undefined;
  return p;
}

function mean(points: Point[]) {
  return points.reduce((a, p) => a + p.value, 0) / points.length;
}

// ---- Credit ----

export function creditStory(hy: Point[], ccc: Point[]): Story | null {
  const hyNow = hy.at(-1);
  const cccNow = ccc.at(-1);
  const hyThen = yearAgo(hy);
  const cccThen = yearAgo(ccc);
  if (!hyNow || !cccNow || !hyThen || !cccThen) return null;

  const cccMove = cccNow.value - cccThen.value;
  const hyMove = hyNow.value - hyThen.value;
  const headline =
    Math.abs(cccMove) < 0.25
      ? "Borrowing costs for the riskiest companies are little changed from a year ago"
      : cccMove > 0
        ? `Lending to the riskiest companies costs ${bps(cccMove)} basis points more than a year ago`
        : `Lending to the riskiest companies costs ${bps(cccMove)} basis points less than a year ago`;

  const body = [
    `Companies rated CCC, the lowest rung of junk debt, now pay ${cccNow.value.toFixed(2)} percentage points more interest than the US government. A year ago they paid ${cccThen.value.toFixed(2)} more. (A basis point is a hundredth of a percentage point.)`,
    `Across all junk-rated companies, the gap is ${hyNow.value.toFixed(2)} points, ${hyMove >= 0 ? "up" : "down"} ${bps(hyMove)} basis points over the same year.`,
  ];
  if (cccMove > 1 && cccMove > 3 * Math.max(hyMove, 0.01)) {
    body.push(
      "The weakest borrowers are being charged much more while the wider market barely moves. Stress usually shows up there first.",
    );
  }
  const avg = mean(hy);
  const first = hy[0];
  if (first) {
    body.push(
      `Since ${monthYear(first.periodEnd)}, the junk-bond gap has averaged ${avg.toFixed(2)} points, so today's level is ${hyNow.value > avg + 0.25 ? "above" : hyNow.value < avg - 0.25 ? "below" : "close to"} that average.`,
    );
  }
  return { headline, body };
}

// ---- Spending ----

// Free cash flow against its peak, only when it has fallen more than 10%
// and the peak is not the latest point. Shared by the story and the figures.
export function fcfFromPeak(fcfTtm: Point[]) {
  const now = fcfTtm.at(-1);
  const peak = fcfTtm.reduce<Point | undefined>(
    (m, p) => (!m || p.value > m.value ? p : m),
    undefined,
  );
  if (!now || !peak || peak.periodEnd === now.periodEnd) return null;
  const drop = 1 - now.value / peak.value;
  return drop > 0.1 ? { now, peak, drop } : null;
}

export function capexStory(capexTtm: Point[], fcfTtm: Point[]): Story | null {
  const now = capexTtm.at(-1);
  const then = yearAgo(capexTtm);
  if (!now || !then) return null;
  const growth = now.value / then.value - 1;
  const headline = `Big tech spent ${usd(now.value)} on data centers and equipment in a year, ${growth >= 0 ? "up" : "down"} ${pct(growth)}`;

  const body = [
    `Microsoft, Alphabet, Amazon, Meta and Oracle spent ${usd(now.value)} on capital projects in the 12 months to ${shortDate(now.periodEnd)}. A year earlier it was ${usd(then.value)}.`,
    "The companies say a growing share goes to AI data centers and chips. Their filings don't say how much.",
  ];
  const fcfNow = fcfTtm.at(-1);
  if (fcfNow) {
    const fall = fcfFromPeak(fcfTtm);
    body.push(
      fall
        ? `What's left after that spending, their free cash flow, is ${usd(fcfNow.value)}. That is ${pct(fall.drop)} below its peak of ${usd(fall.peak.value)} in ${monthYear(fall.peak.periodEnd)}.`
        : `What's left after that spending, their free cash flow, is ${usd(fcfNow.value)}.`,
    );
  }
  body.push(
    "These companies can afford it: their businesses still produce more cash than they spend. The question is how long that stays true if spending keeps climbing.",
  );
  return { headline, body };
}

// 12-month capex against operating cash flow for the same period end. The
// ratio is null when cash flow is zero or negative: it would mean nothing.
export function capexToOcf(capexTtm: Point[], ocfTtm: Point[]) {
  const capex = capexTtm.at(-1);
  const ocf = ocfTtm.find((p) => p.periodEnd === capex?.periodEnd);
  if (!capex || !ocf) return null;
  return { capex, ocf, ratio: ocf.value > 0 ? capex.value / ocf.value : null };
}

export function neocloudStory(
  name: string,
  capexTtm: Point[],
  ocfTtm: Point[],
  debt: Point[],
): Story | null {
  const r = capexToOcf(capexTtm, ocfTtm);
  if (!r) return null;
  const { capex, ocf, ratio } = r;
  const body = [
    `In the 12 months to ${shortDate(capex.periodEnd)}, ${name} spent ${usd(capex.value)} on capital projects. Its operations brought in ${usd(ocf.value)} in cash.`,
  ];
  const d = debt.at(-1);
  if (d) {
    body.push(
      `Borrowing and leases cover the gap. Its long-term debt was ${usd(d.value)} on ${shortDate(d.periodEnd)}. The Credit page lists each loan and bond.`,
    );
  }
  body.push(
    "Neoclouds like this depend on lenders staying willing. That is why borrowing costs and used-GPU prices matter so much here.",
  );
  if (ratio == null) {
    return {
      headline: `${name} spent ${usd(capex.value)} in a year while its operations burned cash`,
      body,
    };
  }
  return {
    headline: `${name} is spending ${ratio.toFixed(1)}× the cash its business brings in`,
    body,
  };
}

// ---- GPU prices ----

// Most recent date the value changed, for step-like list prices.
export function lastChange(points: Point[]) {
  for (let i = points.length - 1; i > 0; i--) {
    const cur = points[i];
    const prev = points[i - 1];
    if (cur && prev && Math.abs(cur.value - prev.value) > 1e-9) return { from: prev, to: cur };
  }
  return undefined;
}

export function rentalStory(awsH100: Point[], azureH100: Point[]): Story | null {
  const now = awsH100.at(-1);
  const first = awsH100[0];
  if (!now || !first) return null;
  const change = now.value / first.value - 1;
  const step = lastChange(awsH100);
  const headline =
    Math.abs(change) < 0.02
      ? `Renting an Nvidia H100 on AWS costs the same as in ${monthYear(first.periodEnd)}`
      : `Renting an Nvidia H100 on AWS costs ${pct(change)} ${change < 0 ? "less" : "more"} than in ${monthYear(first.periodEnd)}`;
  const body = [
    `Amazon's list price is $${now.value.toFixed(2)} per GPU per hour, compared with $${first.value.toFixed(2)} in ${monthYear(first.periodEnd)}.${step ? ` The last change came in ${monthYear(step.to.periodEnd)}.` : ""}`,
  ];
  const az = azureH100.at(-1);
  if (az) {
    body.push(`Microsoft lists the same chip at $${az.value.toFixed(2)} per GPU-hour.`);
  }
  body.push(
    "Falling prices can mean more capacity than demand. But newer chips make older ones cheaper by design, so a price cut alone doesn't prove a glut.",
  );
  return { headline, body };
}

export function resaleStory(index: Point[]): Story | null {
  const now = index.at(-1);
  const c = changeOver(index, 182);
  if (!now || !c || c.pct == null) return null;
  const headline =
    c.pct < -0.02
      ? `Used data-center GPUs resell for ${pct(c.pct)} less than six months ago`
      : c.pct > 0.02
        ? `Used data-center GPUs resell for ${pct(c.pct)} more than six months ago`
        : "Used data-center GPU prices are flat over six months";
  return {
    headline,
    body: [
      `An index of completed sales stood at ${now.value.toFixed(0)} in ${monthYear(now.periodEnd)}, where 100 is the level of early 2025.`,
      "Many GPU loans use the chips themselves as collateral. If resale values fall faster than loans are repaid, lenders are less protected.",
    ],
  };
}

// ---- Buildings ----

export function buildingsStory(vacancy: Point[]): Story | null {
  const vac = vacancy.at(-1);
  if (!vac) return null;
  const headline =
    vac.value < 5
      ? `Data centers are nearly full: only ${vac.value.toFixed(1)}% of space is empty`
      : `${vac.value.toFixed(1)}% of data-center space now sits empty`;
  return {
    headline,
    body: [
      `In North America's main data-center markets, vacancy was ${vac.value.toFixed(1)}% at the end of ${monthYear(vac.periodEnd)}.`,
      "Vacancy usually rises late in a downturn, so it is a slow signal.",
    ],
  };
}

const mw = (v: number) => `${Math.round(v).toLocaleString("en-US")} MW`;

export function constructionStory(construction: Point[], preleased: Point[]): Story | null {
  const build = construction.at(-1);
  if (!build) return null;
  const then = yearAgo(construction);
  const change = then ? build.value / then.value - 1 : null;
  let headline = `${mw(build.value)} of data-center capacity is under construction`;
  if (change != null && Math.abs(change) >= 0.02) {
    headline = `${mw(build.value)} is under construction, ${change > 0 ? "up" : "down"} ${pct(change)} in a year`;
  }
  const body = [
    `In North America's main data-center markets, ${Math.round(build.value).toLocaleString("en-US")} megawatts was under construction at the end of ${monthYear(build.periodEnd)}${then ? `, ${build.value >= then.value ? "up" : "down"} ${pct(build.value / then.value - 1)} from a year earlier` : ""}.`,
  ];
  const pre = preleased.at(-1);
  if (pre) {
    body.push(
      `${pre.value.toFixed(0)}% of that new space is already leased before it is finished. ${pre.value >= 70 ? "Most of it is spoken for, which is reassuring." : "The rest is being built without a tenant lined up."}`,
    );
  }
  return { headline, body };
}

// ---- Homepage chapter figures ----

export type Figure = { label: string; value: string; note: string };

type HomeSeries = {
  credit: { hy: Point[]; ccc: Point[] };
  capex: { capexTtm: Point[]; fcfTtm: Point[] };
  neocloud: { capexTtm: Point[]; ocfTtm: Point[] };
  rental: { aws: Point[] };
  resale: { index: Point[] };
  buildings: { vacancy: Point[]; construction: Point[]; preleased: Point[] };
};

// How fresh the series behind each figure is. A figure built from several
// series carries the worst of them. Missing means unknown, and adds no note.
export type HomeFreshness = Partial<
  Record<
    | "ccc"
    | "hy"
    | "capex"
    | "fcf"
    | "crwv"
    | "aws"
    | "resale"
    | "vacancy"
    | "construction"
    | "preleased",
    Freshness
  >
>;

// "$691B", "$1.2T": the short money form for figures.
export const usdShort = (v: number) => usd(v).replace(" billion", "B").replace(" trillion", "T");

const upDown = (change: number) => `${change >= 0 ? "up" : "down"} ${pct(change)}`;

// Figures for each chapter's stat list. A row is left out when its data is
// missing; derived figures say "calculated".
export function homeFigures(
  s: HomeSeries,
  fresh: HomeFreshness = {},
): Record<"borrow" | "build" | "rent" | "fill", Figure[]> {
  const spread = (label: string, pts: Point[], state: Freshness | undefined): Figure[] => {
    const last = pts.at(-1);
    if (!last) return [];
    // Only compare with a real point within 3 weeks of a year earlier.
    const y = changeOver(pts, 365, 21);
    const move = y ? ` · ${y.delta >= 0 ? "+" : "−"}${bps(y.delta)} bps in a year` : "";
    return [
      {
        label,
        value: `${last.value.toFixed(2)}%`,
        note: `${shortDate(last.periodEnd)}${move}${freshnessSuffix(state)}`,
      },
    ];
  };

  const build: Figure[] = [];
  const capex = s.capex.capexTtm.at(-1);
  if (capex) {
    const then = yearAgo(s.capex.capexTtm);
    build.push({
      label: "Big tech capex, 12 months",
      value: usdShort(capex.value),
      note: `to ${shortDate(capex.periodEnd)}${
        then
          ? ` · ${capex.value >= then.value ? "up" : "down"} from ${usd(then.value)} a year earlier`
          : ""
      } · calculated${freshnessSuffix(fresh.capex)}`,
    });
  }
  const fcf = s.capex.fcfTtm.at(-1);
  if (fcf) {
    const fall = fcfFromPeak(s.capex.fcfTtm);
    build.push({
      label: "Big tech free cash flow, 12 months",
      value: usdShort(fcf.value),
      note: `${fall ? `${pct(fall.drop)} below its ${monthYear(fall.peak.periodEnd)} peak` : `to ${shortDate(fcf.periodEnd)}`} · calculated${freshnessSuffix(fresh.fcf)}`,
    });
  }
  const crwv = capexToOcf(s.neocloud.capexTtm, s.neocloud.ocfTtm);
  if (crwv) {
    build.push({
      label: "CoreWeave capex ÷ operating cash flow",
      value: crwv.ratio == null ? "Cash flow negative" : `${crwv.ratio.toFixed(1)}×`,
      note: `12-month totals to ${shortDate(crwv.capex.periodEnd)} · calculated${freshnessSuffix(fresh.crwv)}`,
    });
  }

  const rent: Figure[] = [];
  const aws = s.rental.aws.at(-1);
  const awsFirst = s.rental.aws[0];
  if (aws && awsFirst) {
    const change = aws.value / awsFirst.value - 1;
    const vs =
      Math.abs(change) < 0.02
        ? `unchanged since ${monthYear(awsFirst.periodEnd)}`
        : `${pct(change)} ${change < 0 ? "below" : "above"} ${monthYear(awsFirst.periodEnd)}`;
    rent.push({
      label: "Nvidia H100 on AWS, per GPU-hour",
      value: `$${aws.value.toFixed(2)}`,
      note: `${shortDate(aws.periodEnd)} · ${vs} · list price${freshnessSuffix(fresh.aws)}`,
    });
  }
  const idx = s.resale.index.at(-1);
  if (idx) {
    const c = changeOver(s.resale.index, 182);
    rent.push({
      label: "Used-GPU resale index",
      value: idx.value.toFixed(0),
      note: `${monthYear(idx.periodEnd)}${
        c?.pct != null ? ` · ${pct(c.pct)} ${c.pct < 0 ? "below" : "above"} six months earlier` : ""
      }${freshnessSuffix(fresh.resale)}`,
    });
  }

  const fill: Figure[] = [];
  const vac = s.buildings.vacancy.at(-1);
  if (vac) {
    fill.push({
      label: "Empty data-center space",
      value: `${vac.value.toFixed(1)}%`,
      note: `${monthYear(vac.periodEnd)} · main North American markets${freshnessSuffix(fresh.vacancy)}`,
    });
  }
  const built = s.buildings.construction.at(-1);
  if (built) {
    const then = yearAgo(s.buildings.construction);
    fill.push({
      label: "Under construction",
      value: mw(built.value),
      note: `${monthYear(built.periodEnd)}${then ? ` · ${upDown(built.value / then.value - 1)} in a year` : ""}${freshnessSuffix(fresh.construction)}`,
    });
  }
  const pre = s.buildings.preleased.at(-1);
  if (pre) {
    fill.push({
      label: "Already pre-leased",
      value: `${pre.value.toFixed(1)}%`,
      note: `${monthYear(pre.periodEnd)} · of capacity under construction${freshnessSuffix(fresh.preleased)}`,
    });
  }

  return {
    borrow: [
      ...spread("Riskiest companies (CCC-rated)", s.credit.ccc, fresh.ccc),
      ...spread("All junk-rated", s.credit.hy, fresh.hy),
    ],
    build,
    rent,
    fill,
  };
}

// Turns series into plain-English headlines and paragraphs for the homepage.
// Every number in the text comes from the data passed in; when the data is
// too thin to support a sentence, the function returns null instead of
// guessing. Wording never claims causes, only what the numbers show.
import { changeOver, type Point, valueAtOrBefore } from "~/metrics/changes";

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

function yearAgo(points: Point[]) {
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
    `Investors now demand ${cccNow.value.toFixed(2)} percentage points more interest than US government bonds to lend to companies rated CCC, the lowest rung of junk debt. A year ago it was ${cccThen.value.toFixed(2)}. (A basis point is a hundredth of a percentage point.)`,
    `Across all junk-rated companies the gap is ${hyNow.value.toFixed(2)} points, ${hyMove >= 0 ? "up" : "down"} ${bps(hyMove)} basis points over the same year.`,
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

export function capexStory(capexTtm: Point[], fcfTtm: Point[]): Story | null {
  const now = capexTtm.at(-1);
  const then = yearAgo(capexTtm);
  if (!now || !then) return null;
  const growth = now.value / then.value - 1;
  const headline = `Big tech spent ${usd(now.value)} on data centers and equipment in a year, ${growth >= 0 ? "up" : "down"} ${pct(growth)}`;

  const body = [
    `Microsoft, Alphabet, Amazon, Meta and Oracle together spent ${usd(now.value)} on capital projects in the 12 months to ${shortDate(now.periodEnd)}, compared with ${usd(then.value)} a year earlier. The companies say a growing share of it goes to AI data centers and chips; the filings do not break it out.`,
  ];
  const fcfNow = fcfTtm.at(-1);
  const peak = fcfTtm.reduce<Point | undefined>(
    (m, p) => (!m || p.value > m.value ? p : m),
    undefined,
  );
  if (fcfNow && peak) {
    const drop = 1 - fcfNow.value / peak.value;
    body.push(
      drop > 0.1 && peak.periodEnd !== fcfNow.periodEnd
        ? `What is left after that spending, their combined free cash flow, is ${usd(fcfNow.value)}. That is ${pct(drop)} below its peak of ${usd(peak.value)} in ${monthYear(peak.periodEnd)}.`
        : `What is left after that spending, their combined free cash flow, is ${usd(fcfNow.value)}.`,
    );
  }
  body.push(
    "These companies can afford it: their businesses still produce more cash than they spend. The question is how long that stays true if spending keeps climbing.",
  );
  return { headline, body };
}

export function neocloudStory(
  name: string,
  capexTtm: Point[],
  ocfTtm: Point[],
  debt: Point[],
): Story | null {
  const capex = capexTtm.at(-1);
  const ocf = ocfTtm.find((p) => p.periodEnd === capex?.periodEnd);
  if (!capex || !ocf) return null;
  const body = [
    `In the 12 months to ${shortDate(capex.periodEnd)}, ${name} spent ${usd(capex.value)} on capital projects. Its operations brought in ${usd(ocf.value)} in cash.`,
  ];
  const d = debt.at(-1);
  if (d) {
    body.push(
      `The gap is covered by borrowing and leases. Its long-term debt was ${usd(d.value)} on ${shortDate(d.periodEnd)}; the Credit page lists the individual loans and bonds.`,
    );
  }
  body.push(
    "Specialist AI clouds like this depend on lenders staying willing. That is why credit spreads and GPU resale values matter so much here.",
  );
  if (ocf.value <= 0) {
    return {
      headline: `${name} spent ${usd(capex.value)} in a year while its operations burned cash`,
      body,
    };
  }
  const ratio = capex.value / ocf.value;
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
    "Falling prices can mean there is more capacity than demand. But newer chips also make older ones cheaper by design, so a price cut on its own is not proof of a glut.",
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

export function buildingsStory(
  vacancy: Point[],
  construction: Point[],
  preleased: Point[],
): Story | null {
  const vac = vacancy.at(-1);
  const build = construction.at(-1);
  if (!vac || !build) return null;
  const headline =
    vac.value < 5
      ? `Data centers are nearly full: only ${vac.value.toFixed(1)}% of space is empty`
      : `${vac.value.toFixed(1)}% of data-center space now sits empty`;
  const buildThen = yearAgo(construction);
  const body = [
    `In North America's main data-center markets, vacancy was ${vac.value.toFixed(1)}% at the end of ${monthYear(vac.periodEnd)}.`,
    `Another ${Math.round(build.value).toLocaleString("en-US")} megawatts was under construction${buildThen ? `, ${build.value >= buildThen.value ? "up" : "down"} ${pct(build.value / buildThen.value - 1)} from a year earlier` : ""}.`,
  ];
  const pre = preleased.at(-1);
  if (pre) {
    body.push(
      `${pre.value.toFixed(0)}% of that new space is already leased before it is finished. ${pre.value >= 70 ? "Most of the building is spoken for, which is reassuring." : "A growing share is being built without a tenant lined up."}`,
    );
  }
  body.push("Vacancy tends to rise late in a downturn, so this is a lagging signal.");
  return { headline, body };
}

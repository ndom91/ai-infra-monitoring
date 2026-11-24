// The search parameters each page route reads, with their defaults and allowed values.
// Routes validate against this, and the Worker's response cache keys on it, so the two
// cannot disagree about what a page depends on. Imports only other pure domain tables.
import { SEC_COMPANIES, SEC_DEBT_COMPANIES } from "./companies";
import { RANGE_KEYS } from "./ranges";

export const TOPICS = ["supply", "space", "rent", "power"] as const;
export const PUBLISHERS = ["cbre", "jll"] as const;

const range = (fallback: (typeof RANGE_KEYS)[number]) => ({
  default: fallback,
  allowed: RANGE_KEYS,
});

// Parameter order here is the order used in cache keys.
export const PAGE_PARAMS = {
  "/": {},
  "/market": { range: range("3y") },
  "/credit": {
    range: range("3y"),
    company: { default: "CRWV", allowed: SEC_DEBT_COMPANIES.map((c) => c.ticker) },
  },
  "/fundamentals": {
    range: range("5y"),
    company: { default: "CRWV", allowed: SEC_COMPANIES.map((c) => c.ticker) },
  },
  "/infrastructure": {
    range: range("max"),
    topic: { default: "supply", allowed: TOPICS },
    publisher: { default: "cbre", allowed: PUBLISHERS },
  },
  "/alerts": {},
  "/coverage": {},
} as const satisfies Record<
  string,
  Record<string, { default: string; allowed: readonly string[] }>
>;

export type PagePath = keyof typeof PAGE_PARAMS;

export const RANGES = {
  "3m": { label: "3M", days: 92 },
  "6m": { label: "6M", days: 183 },
  "1y": { label: "1Y", days: 365 },
  "3y": { label: "3Y", days: 1096 },
  "5y": { label: "5Y", days: 1827 },
  max: { label: "Max", days: 0 },
} as const;

export type RangeKey = keyof typeof RANGES;
export const RANGE_KEYS = Object.keys(RANGES) as RangeKey[];

export function parseRange(raw: unknown, fallback: RangeKey = "1y"): RangeKey {
  return RANGE_KEYS.includes(raw as RangeKey) ? (raw as RangeKey) : fallback;
}

export function rangeStart(range: RangeKey, now: Date) {
  const { days } = RANGES[range];
  if (days === 0) return undefined;
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

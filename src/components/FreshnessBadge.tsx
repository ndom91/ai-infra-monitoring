import { FRESHNESS_LABEL, type Freshness } from "~/domain/freshness";

export function FreshnessBadge({ state }: { state: Freshness }) {
  return <span className={`badge fresh-${state}`}>{FRESHNESS_LABEL[state]}</span>;
}

import type { ObservationInput, SeriesDef } from "~/domain/types";
import type { CollectorError } from "./errors";
import type { fetchWithRetry } from "./http";

export type CollectContext = {
  backfill: boolean;
  now: Date;
  fetch: typeof fetchWithRetry;
  log: (msg: string) => void;
};

export type Snapshot = { contentType: string; body: string };

export type FilingEventInput = {
  accession: string;
  ticker: string;
  company: string;
  form: string;
  filedAt: string;
  acceptedAt?: string;
  reportDate?: string;
  items?: string;
  description?: string;
  sourceUrl: string;
};

export type CollectOutput = {
  series: SeriesDef[];
  observations: ObservationInput[];
  snapshots?: Snapshot[];
  filingEvents?: FilingEventInput[];
  // Sub-sources that failed while others succeeded. Makes the run "partial".
  failures?: { key: string; error: CollectorError }[];
};

export type Collector = {
  name: string;
  description: string;
  collect(ctx: CollectContext): Promise<CollectOutput>;
};

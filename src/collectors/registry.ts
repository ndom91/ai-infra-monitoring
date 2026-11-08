import { awsCollector } from "./aws";
import { azureCollector } from "./azure";
import { eiaCollector } from "./eia";
import { fredCollector } from "./fred";
import { manualCollector } from "./manual";
import { runcrateCollector } from "./runcrate";
import { saladCollector } from "./salad";
import { secCollector } from "./sec";
import { secFilingsCollector } from "./sec-filings";
import type { Collector } from "./types";

export const COLLECTORS: Collector[] = [
  fredCollector,
  secCollector,
  secFilingsCollector,
  azureCollector,
  awsCollector,
  saladCollector,
  runcrateCollector,
  eiaCollector,
  manualCollector,
];

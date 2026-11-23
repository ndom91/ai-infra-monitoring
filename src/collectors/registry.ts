import { awsCollector } from "./aws";
import { azureCollector } from "./azure";
import { eiaCollector } from "./eia";
import { fredCollector } from "./fred";
import { manualCollector } from "./manual";
import { saladCollector } from "./salad";
import { secCollector } from "./sec";
import { secDebtCollector } from "./sec-debt";
import { secFilingsCollector } from "./sec-filings";
import { secInsiderCollector } from "./sec-insider";
import type { Collector } from "./types";

export const COLLECTORS: Collector[] = [
  fredCollector,
  secCollector,
  secDebtCollector,
  secFilingsCollector,
  secInsiderCollector,
  azureCollector,
  awsCollector,
  saladCollector,
  eiaCollector,
  manualCollector,
];

import { fredCollector } from "./fred";
import { secCollector } from "./sec";
import type { Collector } from "./types";

export const COLLECTORS: Collector[] = [fredCollector, secCollector];

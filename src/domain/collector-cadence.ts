// How often each collector runs, as scheduled in .github/workflows. Keep in
// step with the workflow cron entries; a test checks every collector has one.
export const COLLECTOR_CADENCE: Record<string, string> = {
  fred: "weekdays",
  sec: "weekdays",
  sec_debt: "weekdays",
  sec_filings: "3x weekdays",
  sec_insider: "3x weekdays",
  census: "weekdays",
  eia: "every 14 days",
  azure: "weekly",
  aws: "weekly",
  salad: "weekly",
  runcrate: "weekly",
  manual: "on update",
};

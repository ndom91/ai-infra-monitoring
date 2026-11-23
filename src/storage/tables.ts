// Every table that backup writes and restore reads, in dependency order
// (parents before the tables that reference them).
export const BACKUP_TABLES = [
  "collector_runs",
  "series",
  "observations",
  "raw_snapshots",
  "filing_events",
  "alert_events",
] as const;

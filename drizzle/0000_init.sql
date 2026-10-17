CREATE TABLE `alert_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` text NOT NULL,
	`triggered_at` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`evidence` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alert_events_dedupeKey_unique` ON `alert_events` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `alerts_time_idx` ON `alert_events` (`triggered_at`);--> statement-breakpoint
CREATE TABLE `collector_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collector` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`error_class` text,
	`message` text,
	`fetched` integer DEFAULT 0 NOT NULL,
	`inserted` integer DEFAULT 0 NOT NULL,
	`revised` integer DEFAULT 0 NOT NULL,
	`unchanged` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runs_collector_idx` ON `collector_runs` (`collector`,`started_at`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`value` real NOT NULL,
	`kind` text NOT NULL,
	`as_of` text,
	`source_url` text,
	`note` text,
	`collected_at` text NOT NULL,
	`run_id` integer NOT NULL,
	`is_latest` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `collector_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `obs_vintage_uq` ON `observations` (`series_id`,`period_end`,`collected_at`);--> statement-breakpoint
CREATE INDEX `obs_latest_idx` ON `observations` (`series_id`,`is_latest`,`period_end`);--> statement-breakpoint
CREATE TABLE `raw_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`taken_at` text NOT NULL,
	`content_type` text NOT NULL,
	`sha256` text NOT NULL,
	`body` blob NOT NULL,
	`run_id` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `collector_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snap_sha_uq` ON `raw_snapshots` (`source`,`sha256`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`indicator` text NOT NULL,
	`label` text NOT NULL,
	`entity` text,
	`source` text NOT NULL,
	`source_url` text NOT NULL,
	`unit` text NOT NULL,
	`currency` text,
	`methodology` text NOT NULL,
	`cadence` text NOT NULL,
	`collector` text NOT NULL,
	`updated_at` text NOT NULL
);

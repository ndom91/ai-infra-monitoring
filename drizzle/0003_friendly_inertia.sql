CREATE TABLE `filing_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`accession` text NOT NULL,
	`ticker` text NOT NULL,
	`company` text NOT NULL,
	`form` text NOT NULL,
	`filed_at` text NOT NULL,
	`accepted_at` text,
	`report_date` text,
	`items` text,
	`description` text,
	`source_url` text NOT NULL,
	`run_id` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `collector_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `filing_events_accession_unique` ON `filing_events` (`accession`);--> statement-breakpoint
CREATE INDEX `filing_events_time_idx` ON `filing_events` (`accepted_at`,`filed_at`);
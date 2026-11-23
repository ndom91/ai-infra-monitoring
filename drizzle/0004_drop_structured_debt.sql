-- The hand-entered structured-debt dataset was dropped in favor of the automated
-- sec_debt collector. Rows are deleted children first because observations
-- reference series.
DELETE FROM `alert_events` WHERE `series_id` GLOB 'structured_debt.*';--> statement-breakpoint
DELETE FROM `observations` WHERE `series_id` GLOB 'structured_debt.*';--> statement-breakpoint
DELETE FROM `series` WHERE `id` GLOB 'structured_debt.*';

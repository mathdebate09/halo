ALTER TABLE `reports` ADD `progress` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `error` text;--> statement-breakpoint
ALTER TABLE `vitals_readings` ADD `label` text;--> statement-breakpoint
ALTER TABLE `vitals_readings` ADD `qualifier` text;--> statement-breakpoint
ALTER TABLE `vitals_readings` ADD `ref_lo` real;--> statement-breakpoint
ALTER TABLE `vitals_readings` ADD `ref_hi` real;--> statement-breakpoint
ALTER TABLE `vitals_readings` ADD `ref_text` text;--> statement-breakpoint
ALTER TABLE `vitals_readings` ADD `raw` text;
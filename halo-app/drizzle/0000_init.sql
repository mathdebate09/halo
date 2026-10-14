CREATE TABLE `advisor_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_state` text DEFAULT 'pending' NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `advisor_thread` ON `advisor_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `daily_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_state` text DEFAULT 'pending' NOT NULL,
	`diet` real,
	`activity` real,
	`sleep` real,
	`vitals` real,
	`water` real,
	`overall` real,
	`tier` text,
	`confidence` text,
	`computed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hc_daily` (
	`day` text PRIMARY KEY NOT NULL,
	`steps` integer,
	`distance_m` real,
	`active_kcal` real,
	`sleep_start` integer,
	`sleep_end` integer,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `insights` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_state` text DEFAULT 'pending' NOT NULL,
	`day` text NOT NULL,
	`type` text NOT NULL,
	`severity` integer NOT NULL,
	`reason` text NOT NULL,
	`action` text,
	`expires_at` integer,
	`state` text DEFAULT 'pending' NOT NULL,
	`segments` text
);
--> statement-breakpoint
CREATE INDEX `insights_day` ON `insights` (`day`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_poll_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_state` text DEFAULT 'pending' NOT NULL,
	`meal_id` text NOT NULL,
	`name` text NOT NULL,
	`portion` text,
	`grams` real,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`confidence` real
);
--> statement-breakpoint
CREATE INDEX `meal_items_meal` ON `meal_items` (`meal_id`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_state` text DEFAULT 'pending' NOT NULL,
	`day` text NOT NULL,
	`eaten_at` integer NOT NULL,
	`meal_type` text NOT NULL,
	`source` text NOT NULL,
	`note` text,
	`photo_uri` text,
	`status` text NOT NULL,
	`job_id` text,
	`kcal` real,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`confidence` real
);
--> statement-breakpoint
CREATE INDEX `meals_day` ON `meals` (`day`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`op_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_op_id_unique` ON `outbox` (`op_id`);--> statement-breakpoint
CREATE INDEX `outbox_next` ON `outbox` (`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_state` text DEFAULT 'pending' NOT NULL,
	`pdf_hash` text NOT NULL,
	`status` text NOT NULL,
	`report_date` text,
	`pages` integer,
	`extracted` text
);
--> statement-breakpoint
CREATE TABLE `vitals_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_state` text DEFAULT 'pending' NOT NULL,
	`metric` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`at` integer NOT NULL,
	`source` text NOT NULL,
	`report_id` text,
	`confirmed` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vitals_metric_at` ON `vitals_readings` (`metric`,`at`);--> statement-breakpoint
CREATE TABLE `water` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_state` text DEFAULT 'pending' NOT NULL,
	`day` text NOT NULL,
	`at` integer NOT NULL,
	`ml` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `water_day` ON `water` (`day`);--> statement-breakpoint
CREATE TABLE `weights` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_state` text DEFAULT 'pending' NOT NULL,
	`day` text NOT NULL,
	`at` integer NOT NULL,
	`kg` real NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `weights_day` ON `weights` (`day`);
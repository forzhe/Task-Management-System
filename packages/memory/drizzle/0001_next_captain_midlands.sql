CREATE TABLE `companion_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`occurred_at` text NOT NULL,
	`ref_event_ids` text DEFAULT '[]' NOT NULL,
	`emotional_weight` real DEFAULT 0.5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `intervention_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`signal` text NOT NULL,
	`fired_date` text NOT NULL,
	`responded` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_streaks` (
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`goal_id` text DEFAULT '' NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL,
	`longest_streak` integer DEFAULT 0 NOT NULL,
	`last_active_date` text DEFAULT '' NOT NULL,
	`broken_at` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`user_id`, `category`, `goal_id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `energy_points` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `attributes_json` text DEFAULT '{}' NOT NULL;
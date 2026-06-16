CREATE TABLE `profile_change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`field` text NOT NULL,
	`sub_path` text,
	`current_value` text,
	`proposed_value` text,
	`reason` text NOT NULL,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
ALTER TABLE `users` ADD `attribute_meta_json` text DEFAULT '{}' NOT NULL;
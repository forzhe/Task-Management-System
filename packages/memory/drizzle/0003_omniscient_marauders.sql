CREATE TABLE `divergences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`claim` text NOT NULL,
	`evidence` text NOT NULL,
	`domain` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	`resolution_note` text
);

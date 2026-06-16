ALTER TABLE `system_evolution_logs` ADD `target_key` text;--> statement-breakpoint
ALTER TABLE `system_evolution_logs` ADD `status` text DEFAULT 'proposed' NOT NULL;--> statement-breakpoint
ALTER TABLE `system_evolution_logs` ADD `created_at` text;
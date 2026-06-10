CREATE TABLE `companions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`current_form` text NOT NULL,
	`personality_params_json` text NOT NULL,
	`unlocked_actions_json` text NOT NULL,
	`unlocked_skins_json` text NOT NULL,
	`current_state` text NOT NULL,
	`current_dialogue` text NOT NULL,
	`state_history_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`type` text NOT NULL,
	`category` text,
	`raw_payload` text NOT NULL,
	`structured` text NOT NULL,
	`embedding` text,
	`occurred_at` text NOT NULL,
	`ingested_at` text NOT NULL,
	`confidence` real NOT NULL,
	`tags` text NOT NULL,
	`related_goal_ids` text NOT NULL,
	`related_task_ids` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`parent_goal_id` text,
	`level` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text,
	`metrics_json` text NOT NULL,
	`start_at` text,
	`deadline` text,
	`status` text NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`ai_breakdown_log_json` text NOT NULL,
	`impulse_probability` real,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`basic_info_json` text NOT NULL,
	`traits_json` text NOT NULL,
	`motivations_json` text NOT NULL,
	`red_lines_json` text NOT NULL,
	`long_term_vision_json` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`scope_start` text NOT NULL,
	`scope_end` text NOT NULL,
	`subjective_json` text NOT NULL,
	`objective_json` text NOT NULL,
	`ai_analysis_json` text NOT NULL,
	`suggested_adjustments_json` text NOT NULL,
	`emotion_tags` text NOT NULL,
	`credibility_check` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_evolution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`evolution_agent_run_id` text,
	`agent_modified` text,
	`change_type` text,
	`old_config` text,
	`new_config` text,
	`reason` text,
	`ab_test_metric` text,
	`applied_at` text,
	`rollback_available` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal_id` text,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`type` text,
	`difficulty` integer NOT NULL,
	`energy_required` text NOT NULL,
	`estimated_minutes` integer,
	`actual_minutes` integer,
	`reward_points` integer NOT NULL,
	`exp_rewards_json` text NOT NULL,
	`failure_penalty` text,
	`acceptance_criteria` text NOT NULL,
	`proof_method` text NOT NULL,
	`scheduled_at` text,
	`started_at` text,
	`completed_at` text,
	`status` text NOT NULL,
	`status_history_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`verified_by_ai` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`current_level` integer DEFAULT 1 NOT NULL,
	`total_exp` integer DEFAULT 0 NOT NULL,
	`credibility_score` real DEFAULT 1 NOT NULL
);

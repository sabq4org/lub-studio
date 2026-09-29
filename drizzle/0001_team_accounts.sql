CREATE TABLE `lub_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL,
	`details` text
);
--> statement-breakpoint
CREATE INDEX `lub_activity_at_idx` ON `lub_activity` (`at`);--> statement-breakpoint
CREATE INDEX `lub_activity_entity_idx` ON `lub_activity` (`entity_id`);--> statement-breakpoint
CREATE TABLE `lub_login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_start` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lub_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lub_sessions_user_idx` ON `lub_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `lub_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`user_id` text,
	`member_id` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX `lub_tokens_email_idx` ON `lub_tokens` (`email`);--> statement-breakpoint
CREATE TABLE `lub_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`password_hash` text,
	`sites_user_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_login_at` text,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lub_users_email_unique` ON `lub_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `lub_users_sites_user_id_unique` ON `lub_users` (`sites_user_id`);
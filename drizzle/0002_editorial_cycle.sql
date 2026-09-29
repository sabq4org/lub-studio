CREATE TABLE `lub_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`author_id` text,
	`author_name` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	`resolved_by` text
);
--> statement-breakpoint
CREATE INDEX `lub_comments_story_idx` ON `lub_comments` (`story_id`);--> statement-breakpoint
CREATE TABLE `lub_story_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`n` integer NOT NULL,
	`hash` text NOT NULL,
	`payload` text NOT NULL,
	`reason` text NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lub_story_versions_story_n` ON `lub_story_versions` (`story_id`,`n`);
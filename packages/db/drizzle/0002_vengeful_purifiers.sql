CREATE TABLE `static_members` (
	`static_id` text NOT NULL,
	`user_id` text NOT NULL,
	`game_role` text,
	`job` text,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	PRIMARY KEY(`static_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `static_slots` (
	`static_id` text NOT NULL,
	`role` text NOT NULL,
	`jobs` text,
	`assignee_user_id` text,
	`status` text NOT NULL,
	`job` text,
	`filled_at` integer,
	PRIMARY KEY(`static_id`, `role`)
);
--> statement-breakpoint
CREATE TABLE `statics` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`leader_id` text NOT NULL,
	`name` text NOT NULL,
	`content_id` text NOT NULL,
	`strategy_id` text,
	`role_id` text NOT NULL,
	`category_id` text NOT NULL,
	`lobby_channel_id` text,
	`recruitment_channel_id` text,
	`current_phase_id` text,
	`paused_until` integer,
	`plan_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `schedules` ADD `static_id` text;
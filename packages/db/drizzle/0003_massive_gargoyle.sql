CREATE TABLE `vote_responses` (
	`vote_id` text NOT NULL,
	`user_id` text NOT NULL,
	`candidate_index` integer NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`vote_id`, `user_id`, `candidate_index`)
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text,
	`creator_id` text NOT NULL,
	`title` text NOT NULL,
	`candidates` text NOT NULL,
	`closes_at` integer,
	`closed` integer DEFAULT false NOT NULL,
	`static_id` text,
	`created_at` integer NOT NULL
);

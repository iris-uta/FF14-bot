CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`content_id` text,
	`phase_id` text,
	`starts_at` integer NOT NULL,
	`notify_minutes_before` integer DEFAULT 10 NOT NULL,
	`notified_at` integer,
	`mention` text,
	`note` text,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL
);

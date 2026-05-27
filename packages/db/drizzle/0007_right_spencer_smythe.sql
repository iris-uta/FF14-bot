CREATE TABLE `recurring_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`content_id` text,
	`phase_id` text,
	`static_id` text,
	`weekday` integer NOT NULL,
	`hour_jst` integer NOT NULL,
	`minute_jst` integer NOT NULL,
	`notify_minutes_before` integer DEFAULT 10 NOT NULL,
	`mention` text,
	`note` text,
	`active` integer DEFAULT true NOT NULL,
	`last_inserted_at` integer,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recurring_guild_active_idx` ON `recurring_schedules` (`guild_id`,`active`);--> statement-breakpoint
CREATE INDEX `recurring_created_by_idx` ON `recurring_schedules` (`created_by`);
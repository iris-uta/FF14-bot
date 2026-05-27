CREATE TABLE `progress_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`static_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`phase_id` text,
	`status` text NOT NULL,
	`note` text,
	`logged_at` integer NOT NULL,
	`created_at` integer NOT NULL
);

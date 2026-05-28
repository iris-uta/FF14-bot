CREATE TABLE `wizard_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`creator_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `wizard_sessions_expires_at_idx` ON `wizard_sessions` (`expires_at`);
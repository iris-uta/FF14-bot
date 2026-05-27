CREATE INDEX `progress_logs_static_id_idx` ON `progress_logs` (`static_id`);--> statement-breakpoint
CREATE INDEX `schedules_notified_at_idx` ON `schedules` (`notified_at`);--> statement-breakpoint
CREATE INDEX `schedules_guild_id_idx` ON `schedules` (`guild_id`);--> statement-breakpoint
CREATE INDEX `schedules_static_id_idx` ON `schedules` (`static_id`);--> statement-breakpoint
CREATE INDEX `static_members_static_left_at_idx` ON `static_members` (`static_id`,`left_at`);--> statement-breakpoint
CREATE INDEX `statics_guild_id_idx` ON `statics` (`guild_id`);--> statement-breakpoint
CREATE INDEX `statics_lobby_channel_idx` ON `statics` (`lobby_channel_id`);--> statement-breakpoint
CREATE INDEX `statics_category_idx` ON `statics` (`category_id`);--> statement-breakpoint
CREATE INDEX `votes_guild_closed_idx` ON `votes` (`guild_id`,`closed`);--> statement-breakpoint
CREATE INDEX `votes_closed_closes_at_idx` ON `votes` (`closed`,`closes_at`);--> statement-breakpoint
CREATE INDEX `votes_closed_reminded_idx` ON `votes` (`closed`,`reminded_at`);
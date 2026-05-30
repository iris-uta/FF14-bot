CREATE TABLE `content_lifecycle` (
	`content_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);

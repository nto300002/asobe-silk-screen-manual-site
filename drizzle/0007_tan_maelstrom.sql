CREATE TABLE `app_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`last_activity_ms` integer NOT NULL,
	`created_at_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_sessions_user_id_idx` ON `app_sessions` (`user_id`);
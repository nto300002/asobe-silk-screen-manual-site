ALTER TABLE `app_sessions` ADD COLUMN `email` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `app_sessions` ADD COLUMN `display_name` text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`browser_token_hash` text NOT NULL,
	`nonce` text NOT NULL,
	`code_verifier` text NOT NULL,
	`return_to` text NOT NULL,
	`expires_at_ms` integer NOT NULL,
	`created_at_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_states_expires_at_idx` ON `oauth_states` (`expires_at_ms`);
--> statement-breakpoint
CREATE TABLE `staff_identities` (
	`google_sub` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL DEFAULT '',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `staff_identities_user_id_idx` ON `staff_identities` (`user_id`);

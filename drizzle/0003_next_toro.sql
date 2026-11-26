CREATE TABLE `account_identities` (
	`access_sub` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'pending' NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`user_id` integer,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_identities_user_id_unique` ON `account_identities` (`user_id`);--> statement-breakpoint
CREATE TABLE `edit_grants` (
	`access_sub` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`access_sub`) REFERENCES `account_identities`(`access_sub`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `passkey_challenges` (
	`access_sub` text NOT NULL,
	`purpose` text NOT NULL,
	`challenge` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`access_sub`, `purpose`),
	FOREIGN KEY (`access_sub`) REFERENCES `account_identities`(`access_sub`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `passkeys` (
	`credential_id` text PRIMARY KEY NOT NULL,
	`access_sub` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`access_sub`) REFERENCES `account_identities`(`access_sub`) ON UPDATE no action ON DELETE no action
);

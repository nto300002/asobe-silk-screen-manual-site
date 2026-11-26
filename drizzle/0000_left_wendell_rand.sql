CREATE TABLE `progress` (
	`user_id` integer NOT NULL,
	`step_id` text NOT NULL,
	`item_index` integer NOT NULL,
	`checked_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `step_id`, `item_index`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_key_unique` ON `users` (`name_key`);
CREATE TABLE `progress_archives` (
	`merge_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`step_id` text NOT NULL,
	`item_index` integer NOT NULL,
	`checked_at` text NOT NULL,
	`archived_at` text NOT NULL,
	`actor_sub` text NOT NULL,
	PRIMARY KEY(`merge_id`, `user_id`, `step_id`, `item_index`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

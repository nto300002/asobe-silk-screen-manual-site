CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_sub` text NOT NULL,
	`occurred_at` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL
);

CREATE TABLE `manual_documents` (
	`id` integer PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `editor_email` text;
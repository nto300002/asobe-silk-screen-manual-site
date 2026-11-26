CREATE TABLE `staff_enrollment_grants` (
	`access_sub` text PRIMARY KEY NOT NULL,
	`approved_by` text NOT NULL,
	`target_role` text NOT NULL,
	`confirmed_name` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`access_sub`) REFERENCES `account_identities`(`access_sub`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `account_identities` ADD `approved_at` text;
--> statement-breakpoint
CREATE TRIGGER `account_no_legacy_pending_insert`
BEFORE INSERT ON `account_identities`
WHEN NEW.role = 'pending'
BEGIN SELECT RAISE(ABORT, 'pending role is retired'); END;
--> statement-breakpoint
CREATE TRIGGER `account_no_legacy_pending_update`
BEFORE UPDATE OF role ON `account_identities`
WHEN NEW.role = 'pending'
BEGIN SELECT RAISE(ABORT, 'pending role is retired'); END;

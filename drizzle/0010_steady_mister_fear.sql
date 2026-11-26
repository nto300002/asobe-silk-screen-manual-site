CREATE TABLE `manual_video_preview_checks` (
	`video_id` text NOT NULL,
	`version` integer NOT NULL,
	`platform` text NOT NULL CHECK (`platform` IN ('ios_safari','android_chrome')),
	`actor_sub` text NOT NULL,
	`confirmed_at` text NOT NULL,
	PRIMARY KEY(`video_id`, `version`, `platform`),
	FOREIGN KEY (`video_id`) REFERENCES `manual_videos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `manual_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`step_id` text,
	`title` text NOT NULL,
	`youtube_id` text NOT NULL,
	`purpose` text,
	`description` text,
	`filmed_at` text,
	`duration_seconds` integer,
	`status` text NOT NULL CHECK (`status` IN ('draft','published','archived')),
	`version` integer DEFAULT 1 NOT NULL,
	`base_published_id` text,
	`preview_confirmed_at` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `manual_videos_status_updated` ON `manual_videos` (`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `manual_videos_one_draft` ON `manual_videos` (`entry_id`) WHERE status = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX `manual_videos_one_published` ON `manual_videos` (`entry_id`) WHERE status = 'published';--> statement-breakpoint
CREATE UNIQUE INDEX `manual_videos_one_step` ON `manual_videos` (`step_id`) WHERE status = 'published' AND step_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `manual_videos_one_step_draft` ON `manual_videos` (`step_id`) WHERE status = 'draft' AND step_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER manual_videos_publish BEFORE UPDATE OF status ON manual_videos
WHEN NEW.status = 'published' AND OLD.status = 'draft'
BEGIN
  SELECT CASE WHEN (SELECT COUNT(*) FROM manual_video_preview_checks
    WHERE video_id = OLD.id AND version = OLD.version) < 2 THEN RAISE(ABORT, 'preview_required') END;
  SELECT CASE WHEN OLD.base_published_id IS NULL AND EXISTS (
    SELECT 1 FROM manual_videos WHERE entry_id = OLD.entry_id AND status = 'published'
  ) THEN RAISE(ABORT, 'stale_draft') END;
  SELECT CASE WHEN OLD.base_published_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM manual_videos WHERE id = OLD.base_published_id AND entry_id = OLD.entry_id AND status = 'published'
  ) THEN RAISE(ABORT, 'stale_draft') END;
  UPDATE manual_videos SET status = 'archived', archived_at = NEW.updated_at
    WHERE id = OLD.base_published_id AND status = 'published';
END;

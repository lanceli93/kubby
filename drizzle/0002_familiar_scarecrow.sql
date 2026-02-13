CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `media_libraries` ADD `scraper_enabled` integer DEFAULT false NOT NULL;
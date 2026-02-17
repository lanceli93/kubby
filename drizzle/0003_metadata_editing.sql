ALTER TABLE `people` ADD `overview` text;
--> statement-breakpoint
ALTER TABLE `people` ADD `birth_date` text;
--> statement-breakpoint
ALTER TABLE `people` ADD `birth_year` integer;
--> statement-breakpoint
ALTER TABLE `people` ADD `place_of_birth` text;
--> statement-breakpoint
ALTER TABLE `people` ADD `death_date` text;
--> statement-breakpoint
ALTER TABLE `people` ADD `imdb_id` text;
--> statement-breakpoint
ALTER TABLE `people` ADD `date_added` text NOT NULL DEFAULT (datetime('now'));

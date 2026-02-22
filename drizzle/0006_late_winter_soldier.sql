CREATE TABLE `media_streams` (
	`id` text PRIMARY KEY NOT NULL,
	`movie_id` text NOT NULL,
	`disc_number` integer DEFAULT 1,
	`stream_index` integer NOT NULL,
	`stream_type` text NOT NULL,
	`codec` text,
	`profile` text,
	`bitrate` integer,
	`language` text,
	`title` text,
	`is_default` integer,
	`is_forced` integer,
	`width` integer,
	`height` integer,
	`bit_depth` integer,
	`frame_rate` text,
	`hdr_type` text,
	`channels` integer,
	`channel_layout` text,
	`sample_rate` integer,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ms_movie` ON `media_streams` (`movie_id`);--> statement-breakpoint
CREATE INDEX `idx_ms_movie_type` ON `media_streams` (`movie_id`,`stream_type`);--> statement-breakpoint
CREATE TABLE `movie_discs` (
	`id` text PRIMARY KEY NOT NULL,
	`movie_id` text NOT NULL,
	`disc_number` integer NOT NULL,
	`file_path` text NOT NULL,
	`label` text,
	`poster_path` text,
	`runtime_seconds` integer,
	`file_size` integer,
	`video_codec` text,
	`audio_codec` text,
	`video_width` integer,
	`video_height` integer,
	`audio_channels` integer,
	`container` text,
	`total_bitrate` integer,
	`format_name` text,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_md_movie` ON `movie_discs` (`movie_id`);--> statement-breakpoint
CREATE INDEX `idx_md_movie_disc` ON `movie_discs` (`movie_id`,`disc_number`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_media_libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'movie' NOT NULL,
	`folder_path` text NOT NULL,
	`scraper_enabled` integer DEFAULT false NOT NULL,
	`metadata_language` text,
	`last_scanned_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_media_libraries`("id", "name", "type", "folder_path", "scraper_enabled", "metadata_language", "last_scanned_at", "created_at") SELECT "id", "name", "type", "folder_path", "scraper_enabled", "metadata_language", "last_scanned_at", "created_at" FROM `media_libraries`;--> statement-breakpoint
DROP TABLE `media_libraries`;--> statement-breakpoint
ALTER TABLE `__new_media_libraries` RENAME TO `media_libraries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_movies` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`original_title` text,
	`sort_name` text,
	`overview` text,
	`tagline` text,
	`file_path` text NOT NULL,
	`folder_path` text NOT NULL,
	`poster_path` text,
	`fanart_path` text,
	`nfo_path` text,
	`community_rating` real,
	`official_rating` text,
	`runtime_minutes` integer,
	`runtime_seconds` integer,
	`premiere_date` text,
	`year` integer,
	`genres` text,
	`studios` text,
	`country` text,
	`tmdb_id` text,
	`imdb_id` text,
	`video_codec` text,
	`audio_codec` text,
	`video_width` integer,
	`video_height` integer,
	`audio_channels` integer,
	`container` text,
	`total_bitrate` integer,
	`file_size` integer,
	`format_name` text,
	`disc_count` integer DEFAULT 1,
	`poster_mtime` real,
	`fanart_mtime` real,
	`poster_blur` text,
	`tags` text,
	`media_library_id` text NOT NULL,
	`date_added` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`media_library_id`) REFERENCES `media_libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_movies`("id", "title", "original_title", "sort_name", "overview", "tagline", "file_path", "folder_path", "poster_path", "fanart_path", "nfo_path", "community_rating", "official_rating", "runtime_minutes", "runtime_seconds", "premiere_date", "year", "genres", "studios", "country", "tmdb_id", "imdb_id", "video_codec", "audio_codec", "video_width", "video_height", "audio_channels", "container", "total_bitrate", "file_size", "format_name", "disc_count", "poster_mtime", "fanart_mtime", "poster_blur", "tags", "media_library_id", "date_added") SELECT "id", "title", "original_title", "sort_name", "overview", "tagline", "file_path", "folder_path", "poster_path", "fanart_path", "nfo_path", "community_rating", "official_rating", "runtime_minutes", "runtime_seconds", "premiere_date", "year", "genres", "studios", "country", "tmdb_id", "imdb_id", "video_codec", "audio_codec", "video_width", "video_height", "audio_channels", "container", "total_bitrate", "file_size", "format_name", "disc_count", "poster_mtime", "fanart_mtime", "poster_blur", "tags", "media_library_id", "date_added" FROM `movies`;--> statement-breakpoint
DROP TABLE `movies`;--> statement-breakpoint
ALTER TABLE `__new_movies` RENAME TO `movies`;--> statement-breakpoint
CREATE INDEX `idx_movies_library` ON `movies` (`media_library_id`);--> statement-breakpoint
CREATE INDEX `idx_movies_year` ON `movies` (`year`);--> statement-breakpoint
CREATE INDEX `idx_movies_date_added` ON `movies` (`date_added`);--> statement-breakpoint
CREATE TABLE `__new_people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`photo_path` text,
	`photo_mtime` real,
	`photo_blur` text,
	`tmdb_id` text,
	`overview` text,
	`birth_date` text,
	`birth_year` integer,
	`place_of_birth` text,
	`death_date` text,
	`imdb_id` text,
	`tags` text,
	`date_added` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_people`("id", "name", "type", "photo_path", "photo_mtime", "photo_blur", "tmdb_id", "overview", "birth_date", "birth_year", "place_of_birth", "death_date", "imdb_id", "tags", "date_added") SELECT "id", "name", "type", "photo_path", "photo_mtime", "photo_blur", "tmdb_id", "overview", "birth_date", "birth_year", "place_of_birth", "death_date", "imdb_id", "tags", "date_added" FROM `people`;--> statement-breakpoint
DROP TABLE `people`;--> statement-breakpoint
ALTER TABLE `__new_people` RENAME TO `people`;--> statement-breakpoint
CREATE INDEX `idx_people_name` ON `people` (`name`);--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`locale` text DEFAULT 'en',
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "password_hash", "display_name", "is_admin", "locale", "created_at") SELECT "id", "username", "password_hash", "display_name", "is_admin", "locale", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
ALTER TABLE `user_movie_data` ADD `current_disc` integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `external_player_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `external_player_name` text;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `external_player_path` text;
CREATE TABLE `media_libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'movie' NOT NULL,
	`folder_path` text NOT NULL,
	`last_scanned_at` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movie_people` (
	`id` text PRIMARY KEY NOT NULL,
	`movie_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text,
	`sort_order` integer,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mp_movie` ON `movie_people` (`movie_id`);--> statement-breakpoint
CREATE INDEX `idx_mp_person` ON `movie_people` (`person_id`);--> statement-breakpoint
CREATE TABLE `movies` (
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
	`premiere_date` text,
	`year` integer,
	`genres` text,
	`studios` text,
	`country` text,
	`tmdb_id` text,
	`imdb_id` text,
	`media_library_id` text NOT NULL,
	`date_added` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`media_library_id`) REFERENCES `media_libraries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_movies_library` ON `movies` (`media_library_id`);--> statement-breakpoint
CREATE INDEX `idx_movies_year` ON `movies` (`year`);--> statement-breakpoint
CREATE INDEX `idx_movies_date_added` ON `movies` (`date_added`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`photo_path` text,
	`tmdb_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_people_name` ON `people` (`name`);--> statement-breakpoint
CREATE TABLE `user_movie_data` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`movie_id` text NOT NULL,
	`playback_position_seconds` integer DEFAULT 0,
	`play_count` integer DEFAULT 0,
	`is_played` integer DEFAULT false,
	`is_favorite` integer DEFAULT false,
	`last_played_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_umd_user_movie` ON `user_movie_data` (`user_id`,`movie_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
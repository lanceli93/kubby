import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { getDbPath } from "@/lib/paths";

const DB_PATH = getDbPath();

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-apply schema migrations
// Base tables are created IF NOT EXISTS so standalone mode works on a fresh DB.
// ALTER TABLE statements use try/catch to skip when column already exists.
const pending = [
  // 0000: base tables (idempotent — only created if missing)
  `CREATE TABLE IF NOT EXISTS \`users\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`username\` text NOT NULL UNIQUE,
    \`password_hash\` text NOT NULL,
    \`display_name\` text,
    \`is_admin\` integer NOT NULL DEFAULT 0,
    \`locale\` text DEFAULT 'en',
    \`created_at\` text NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS \`settings\` (
    \`key\` text PRIMARY KEY NOT NULL,
    \`value\` text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS \`media_libraries\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`type\` text NOT NULL DEFAULT 'movie',
    \`folder_path\` text NOT NULL,
    \`scraper_enabled\` integer NOT NULL DEFAULT 0,
    \`metadata_language\` text,
    \`last_scanned_at\` text,
    \`created_at\` text NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS \`movies\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`original_title\` text,
    \`sort_name\` text,
    \`overview\` text,
    \`tagline\` text,
    \`file_path\` text NOT NULL,
    \`folder_path\` text NOT NULL,
    \`poster_path\` text,
    \`fanart_path\` text,
    \`nfo_path\` text,
    \`community_rating\` real,
    \`official_rating\` text,
    \`runtime_minutes\` integer,
    \`runtime_seconds\` integer,
    \`premiere_date\` text,
    \`year\` integer,
    \`genres\` text,
    \`studios\` text,
    \`country\` text,
    \`tmdb_id\` text,
    \`imdb_id\` text,
    \`video_codec\` text,
    \`audio_codec\` text,
    \`video_width\` integer,
    \`video_height\` integer,
    \`audio_channels\` integer,
    \`container\` text,
    \`total_bitrate\` integer,
    \`file_size\` integer,
    \`format_name\` text,
    \`disc_count\` integer DEFAULT 1,
    \`poster_mtime\` real,
    \`fanart_mtime\` real,
    \`poster_blur\` text,
    \`tags\` text,
    \`media_library_id\` text NOT NULL REFERENCES \`media_libraries\`(\`id\`) ON DELETE CASCADE,
    \`date_added\` text NOT NULL DEFAULT (datetime('now'))
  )`,
  "CREATE INDEX IF NOT EXISTS `idx_movies_library` ON `movies` (`media_library_id`)",
  "CREATE INDEX IF NOT EXISTS `idx_movies_year` ON `movies` (`year`)",
  "CREATE INDEX IF NOT EXISTS `idx_movies_date_added` ON `movies` (`date_added`)",
  `CREATE TABLE IF NOT EXISTS \`people\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`type\` text NOT NULL,
    \`photo_path\` text,
    \`photo_mtime\` real,
    \`photo_blur\` text,
    \`tmdb_id\` text,
    \`overview\` text,
    \`birth_date\` text,
    \`birth_year\` integer,
    \`place_of_birth\` text,
    \`death_date\` text,
    \`imdb_id\` text,
    \`tags\` text,
    \`date_added\` text NOT NULL DEFAULT (datetime('now'))
  )`,
  "CREATE INDEX IF NOT EXISTS `idx_people_name` ON `people` (`name`)",
  `CREATE TABLE IF NOT EXISTS \`movie_people\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`movie_id\` text NOT NULL REFERENCES \`movies\`(\`id\`) ON DELETE CASCADE,
    \`person_id\` text NOT NULL REFERENCES \`people\`(\`id\`) ON DELETE CASCADE,
    \`role\` text,
    \`sort_order\` integer
  )`,
  "CREATE INDEX IF NOT EXISTS `idx_mp_movie` ON `movie_people` (`movie_id`)",
  "CREATE INDEX IF NOT EXISTS `idx_mp_person` ON `movie_people` (`person_id`)",
  `CREATE TABLE IF NOT EXISTS \`user_movie_data\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
    \`movie_id\` text NOT NULL REFERENCES \`movies\`(\`id\`) ON DELETE CASCADE,
    \`playback_position_seconds\` integer DEFAULT 0,
    \`current_disc\` integer DEFAULT 1,
    \`play_count\` integer DEFAULT 0,
    \`is_played\` integer DEFAULT 0,
    \`is_favorite\` integer DEFAULT 0,
    \`personal_rating\` real,
    \`dimension_ratings\` text,
    \`last_played_at\` text
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS `idx_umd_user_movie` ON `user_movie_data` (`user_id`, `movie_id`)",
  `CREATE TABLE IF NOT EXISTS \`user_person_data\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
    \`person_id\` text NOT NULL REFERENCES \`people\`(\`id\`) ON DELETE CASCADE,
    \`personal_rating\` real,
    \`dimension_ratings\` text
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS `idx_upd_user_person` ON `user_person_data` (`user_id`, `person_id`)",
  `CREATE TABLE IF NOT EXISTS \`user_preferences\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL REFERENCES \`users\`(\`id\`) ON DELETE CASCADE UNIQUE,
    \`movie_rating_dimensions\` text,
    \`person_rating_dimensions\` text,
    \`show_movie_rating_badge\` integer NOT NULL DEFAULT 1,
    \`show_person_tier_badge\` integer NOT NULL DEFAULT 1,
    \`show_person_rating_badge\` integer NOT NULL DEFAULT 1,
    \`show_resolution_badge\` integer NOT NULL DEFAULT 1,
    \`external_player_enabled\` integer NOT NULL DEFAULT 0,
    \`external_player_name\` text,
    \`external_player_path\` text,
    \`external_player_mode\` text DEFAULT 'local'
  )`,
  // 0003: people metadata columns (incremental — skipped if table already has these columns)
  "ALTER TABLE `people` ADD `overview` text",
  "ALTER TABLE `people` ADD `birth_date` text",
  "ALTER TABLE `people` ADD `birth_year` integer",
  "ALTER TABLE `people` ADD `place_of_birth` text",
  "ALTER TABLE `people` ADD `death_date` text",
  "ALTER TABLE `people` ADD `imdb_id` text",
  "ALTER TABLE `people` ADD `date_added` text NOT NULL DEFAULT (datetime('now'))",
  // 0004: resolution badge preference
  "ALTER TABLE `user_preferences` ADD `show_resolution_badge` integer NOT NULL DEFAULT 1",
  // 0005: runtime seconds for accurate progress
  "ALTER TABLE `movies` ADD `runtime_seconds` integer",
  // 0006: tags column for people
  "ALTER TABLE `people` ADD `tags` text",
  // 0007: person rating badge preference
  "ALTER TABLE `user_preferences` ADD `show_person_rating_badge` integer NOT NULL DEFAULT 1",
  // 0008: metadata language per library
  "ALTER TABLE `media_libraries` ADD `metadata_language` text",
  // 0009: media streams table + new columns on movies
  `CREATE TABLE IF NOT EXISTS \`media_streams\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`movie_id\` text NOT NULL REFERENCES \`movies\`(\`id\`) ON DELETE CASCADE,
    \`stream_index\` integer NOT NULL,
    \`stream_type\` text NOT NULL,
    \`codec\` text,
    \`profile\` text,
    \`bitrate\` integer,
    \`language\` text,
    \`title\` text,
    \`is_default\` integer,
    \`is_forced\` integer,
    \`width\` integer,
    \`height\` integer,
    \`bit_depth\` integer,
    \`frame_rate\` text,
    \`hdr_type\` text,
    \`channels\` integer,
    \`channel_layout\` text,
    \`sample_rate\` integer
  )`,
  "CREATE INDEX IF NOT EXISTS `idx_ms_movie` ON `media_streams` (`movie_id`)",
  "CREATE INDEX IF NOT EXISTS `idx_ms_movie_type` ON `media_streams` (`movie_id`, `stream_type`)",
  "ALTER TABLE `movies` ADD `total_bitrate` integer",
  "ALTER TABLE `movies` ADD `file_size` integer",
  "ALTER TABLE `movies` ADD `format_name` text",
  // 0010: multi-disc movie support
  "ALTER TABLE `movies` ADD `disc_count` integer DEFAULT 1",
  "ALTER TABLE `media_streams` ADD `disc_number` integer DEFAULT 1",
  "ALTER TABLE `user_movie_data` ADD `current_disc` integer DEFAULT 1",
  `CREATE TABLE IF NOT EXISTS \`movie_discs\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`movie_id\` text NOT NULL REFERENCES \`movies\`(\`id\`) ON DELETE CASCADE,
    \`disc_number\` integer NOT NULL,
    \`file_path\` text NOT NULL,
    \`label\` text,
    \`poster_path\` text,
    \`runtime_seconds\` integer,
    \`file_size\` integer,
    \`video_codec\` text,
    \`audio_codec\` text,
    \`video_width\` integer,
    \`video_height\` integer,
    \`audio_channels\` integer,
    \`container\` text,
    \`total_bitrate\` integer,
    \`format_name\` text
  )`,
  "CREATE INDEX IF NOT EXISTS `idx_md_movie` ON `movie_discs` (`movie_id`)",
  "CREATE INDEX IF NOT EXISTS `idx_md_movie_disc` ON `movie_discs` (`movie_id`, `disc_number`)",
  // 0012: image mtime + blur placeholder columns for cache-busting without fs.statSync
  "ALTER TABLE `movies` ADD `poster_mtime` real",
  "ALTER TABLE `movies` ADD `fanart_mtime` real",
  "ALTER TABLE `movies` ADD `poster_blur` text",
  "ALTER TABLE `people` ADD `photo_mtime` real",
  "ALTER TABLE `people` ADD `photo_blur` text",
  // 0011: fix literal datetime defaults (Drizzle default() stored string instead of evaluating SQL)
  "UPDATE `users` SET `created_at` = datetime('now') WHERE `created_at` = '(datetime(''now''))'",
  "UPDATE `media_libraries` SET `created_at` = datetime('now') WHERE `created_at` = '(datetime(''now''))'",
  "UPDATE `movies` SET `date_added` = datetime('now') WHERE `date_added` = '(datetime(''now''))'",
  "UPDATE `people` SET `date_added` = datetime('now') WHERE `date_added` = '(datetime(''now''))'",
  // 0013: external player preferences
  "ALTER TABLE `user_preferences` ADD `external_player_enabled` integer NOT NULL DEFAULT 0",
  "ALTER TABLE `user_preferences` ADD `external_player_name` text",
  "ALTER TABLE `user_preferences` ADD `external_player_path` text",
  "ALTER TABLE `user_preferences` ADD `external_player_mode` text DEFAULT 'local'",
];
for (const sql of pending) {
  try { sqlite.exec(sql); } catch { /* column already exists */ }
}

export const db = drizzle(sqlite, { schema });

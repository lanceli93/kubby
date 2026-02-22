import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { getDbPath } from "@/lib/paths";

const DB_PATH = getDbPath();

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-apply schema migrations
const pending = [
  // 0003: people metadata columns
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

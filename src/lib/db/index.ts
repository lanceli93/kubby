import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "kubby.db");

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
    \`codec_long_name\` text,
    \`profile\` text,
    \`level\` integer,
    \`bitrate\` integer,
    \`language\` text,
    \`title\` text,
    \`is_default\` integer,
    \`is_forced\` integer,
    \`width\` integer,
    \`height\` integer,
    \`display_aspect_ratio\` text,
    \`pixel_format\` text,
    \`bit_depth\` integer,
    \`color_space\` text,
    \`color_primaries\` text,
    \`color_transfer\` text,
    \`color_range\` text,
    \`frame_rate\` text,
    \`ref_frames\` integer,
    \`is_interlaced\` integer,
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
];
for (const sql of pending) {
  try { sqlite.exec(sql); } catch { /* column already exists */ }
}

export const db = drizzle(sqlite, { schema });

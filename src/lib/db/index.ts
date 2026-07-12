import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { getDbPath } from "@/lib/paths";
import path from "path";

let _db: BetterSQLite3Database<typeof schema> | null = null;

function initDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db;

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
    // 0014: Jellyfin compatibility mode per library
    "ALTER TABLE `media_libraries` ADD `jellyfin_compat` integer NOT NULL DEFAULT 0",
    // 0015: movie bookmarks table
    `CREATE TABLE IF NOT EXISTS \`movie_bookmarks\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
    \`movie_id\` text NOT NULL REFERENCES \`movies\`(\`id\`) ON DELETE CASCADE,
    \`timestamp_seconds\` integer NOT NULL,
    \`disc_number\` integer DEFAULT 1,
    \`icon_type\` text DEFAULT 'bookmark',
    \`tags\` text,
    \`note\` text,
    \`thumbnail_path\` text,
    \`created_at\` text NOT NULL DEFAULT (datetime('now'))
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_mb_user_movie` ON `movie_bookmarks` (`user_id`, `movie_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_mb_movie` ON `movie_bookmarks` (`movie_id`)",
    // 0016: bookmark icons table (custom user-uploaded icons)
    `CREATE TABLE IF NOT EXISTS \`bookmark_icons\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
    \`label\` text NOT NULL,
    \`image_path\` text NOT NULL,
    \`created_at\` text NOT NULL DEFAULT (datetime('now'))
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_bi_user` ON `bookmark_icons` (`user_id`)",
    // 0017: disabled bookmark icons preference
    "ALTER TABLE `user_preferences` ADD `disabled_bookmark_icons` text",
    // 0018: quick bookmark template
    "ALTER TABLE `user_preferences` ADD `quick_bookmark_template` text",
    // 0019: subtle bookmark markers preference
    "ALTER TABLE `user_preferences` ADD `subtle_bookmark_markers` integer NOT NULL DEFAULT 0",
    // 0020: dot color for custom bookmark icons
    "ALTER TABLE `bookmark_icons` ADD `dot_color` text DEFAULT '#ffffff'",
    // 0021: age at release on movie_people
    "ALTER TABLE `movie_people` ADD `age_at_release` integer",
    // 0022: favorite flag for people
    "ALTER TABLE `user_person_data` ADD `is_favorite` integer DEFAULT 0",
    // 0023: player 360° mode preference
    "ALTER TABLE `user_preferences` ADD `player_360_mode` integer NOT NULL DEFAULT 0",
    // 0024: 360° view state for bookmarks
    "ALTER TABLE `movie_bookmarks` ADD `view_state` text",
    // 0025: bookmark thumbnail aspect ratio
    "ALTER TABLE `movie_bookmarks` ADD `thumbnail_aspect` real",
    // 0026: video stream pix_fmt, level, has_b_frames for iOS HEVC compatibility checks
    "ALTER TABLE `media_streams` ADD `pix_fmt` text",
    "ALTER TABLE `media_streams` ADD `level` integer",
    "ALTER TABLE `media_streams` ADD `has_b_frames` integer",
    // 0028: person own fanart path
    "ALTER TABLE `people` ADD `fanart_path` text",
    // 0029: person body metadata
    "ALTER TABLE `people` ADD `height` integer",
    "ALTER TABLE `people` ADD `weight` integer",
    "ALTER TABLE `people` ADD `measurements` text",
    "ALTER TABLE `people` ADD `cup_size` text",
    // 0030: waist-to-hip ratio (auto-calculated from measurements)
    "ALTER TABLE `people` ADD `whr` real",
    // 0031: dimension weights for weighted average ratings
    "ALTER TABLE `user_preferences` ADD `movie_dimension_weights` text",
    "ALTER TABLE `user_preferences` ADD `person_dimension_weights` text",
    // 0032: per-movie VR stereo layout for 360° playback
    "ALTER TABLE `user_movie_data` ADD `vr_layout` text",
    // 0033: home hero poster wall settings
    "ALTER TABLE `user_preferences` ADD `hero_mosaic_config` text",
    // 0034: home People hero poster wall settings
    "ALTER TABLE `user_preferences` ADD `people_mosaic_config` text",
    // 0035: photo_items table (photos domain)
    `CREATE TABLE IF NOT EXISTS \`photo_items\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`library_id\` text NOT NULL REFERENCES \`media_libraries\`(\`id\`) ON DELETE CASCADE,
    \`file_path\` text NOT NULL UNIQUE,
    \`file_name\` text NOT NULL,
    \`is_video\` integer NOT NULL DEFAULT 0,
    \`taken_at\` integer,
    \`width\` integer,
    \`height\` integer,
    \`duration_seconds\` real,
    \`file_size\` integer,
    \`mime_type\` text,
    \`camera_make\` text,
    \`camera_model\` text,
    \`gps_lat\` real,
    \`gps_lng\` real,
    \`orientation\` integer,
    \`thumbnail_path\` text,
    \`preview_path\` text,
    \`exif_json\` text,
    \`folder_path\` text NOT NULL,
    \`date_added\` text NOT NULL DEFAULT (datetime('now')),
    \`date_modified\` integer
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_pi_library` ON `photo_items` (`library_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_pi_taken` ON `photo_items` (`library_id`, `taken_at`)",
    "CREATE INDEX IF NOT EXISTS `idx_pi_folder` ON `photo_items` (`folder_path`)",
    "CREATE INDEX IF NOT EXISTS `idx_pi_video` ON `photo_items` (`is_video`)",
    // 0036: codec info for photo video items (playback decision inputs)
    "ALTER TABLE `photo_items` ADD `video_codec` text",
    "ALTER TABLE `photo_items` ADD `audio_codec` text",
    "ALTER TABLE `photo_items` ADD `container` text",
    // 0037: photo albums (manual, user-created categories within a photo library)
    `CREATE TABLE IF NOT EXISTS \`photo_albums\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`library_id\` text NOT NULL REFERENCES \`media_libraries\`(\`id\`) ON DELETE CASCADE,
    \`name\` text NOT NULL,
    \`cover_item_id\` text,
    \`sort_order\` integer NOT NULL DEFAULT 0,
    \`created_at\` text NOT NULL DEFAULT (datetime('now'))
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_pa_library` ON `photo_albums` (`library_id`)",
    `CREATE TABLE IF NOT EXISTS \`photo_album_items\` (
    \`album_id\` text NOT NULL REFERENCES \`photo_albums\`(\`id\`) ON DELETE CASCADE,
    \`item_id\` text NOT NULL REFERENCES \`photo_items\`(\`id\`) ON DELETE CASCADE,
    \`added_at\` text NOT NULL DEFAULT (datetime('now'))
  )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS `idx_pai_pk` ON `photo_album_items` (`album_id`, `item_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_pai_item` ON `photo_album_items` (`item_id`)",
    // 0038: music domain tables (artists, albums, tracks + join + user data)
    `CREATE TABLE IF NOT EXISTS \`music_artists\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL UNIQUE,
    \`sort_name\` text,
    \`image_path\` text,
    \`image_blur\` text,
    \`overview\` text,
    \`musicbrainz_id\` text,
    \`date_added\` text NOT NULL DEFAULT (datetime('now'))
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_mar_name` ON `music_artists` (`name`)",
    `CREATE TABLE IF NOT EXISTS \`music_albums\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`library_id\` text NOT NULL REFERENCES \`media_libraries\`(\`id\`) ON DELETE CASCADE,
    \`title\` text NOT NULL,
    \`sort_title\` text,
    \`year\` integer,
    \`cover_path\` text,
    \`cover_blur\` text,
    \`folder_path\` text,
    \`genres\` text,
    \`musicbrainz_id\` text,
    \`date_added\` text NOT NULL DEFAULT (datetime('now'))
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_mal_library` ON `music_albums` (`library_id`)",
    `CREATE TABLE IF NOT EXISTS \`music_album_artists\` (
    \`album_id\` text NOT NULL REFERENCES \`music_albums\`(\`id\`) ON DELETE CASCADE,
    \`artist_id\` text NOT NULL REFERENCES \`music_artists\`(\`id\`) ON DELETE CASCADE
  )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS `idx_maa_pk` ON `music_album_artists` (`album_id`, `artist_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_maa_artist` ON `music_album_artists` (`artist_id`)",
    `CREATE TABLE IF NOT EXISTS \`music_tracks\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`library_id\` text NOT NULL REFERENCES \`media_libraries\`(\`id\`) ON DELETE CASCADE,
    \`album_id\` text REFERENCES \`music_albums\`(\`id\`) ON DELETE CASCADE,
    \`file_path\` text NOT NULL UNIQUE,
    \`file_name\` text NOT NULL,
    \`title\` text NOT NULL,
    \`sort_title\` text,
    \`track_number\` integer,
    \`disc_number\` integer,
    \`duration_seconds\` real,
    \`codec\` text,
    \`bitrate\` integer,
    \`sample_rate\` integer,
    \`channels\` integer,
    \`file_size\` integer,
    \`genres\` text,
    \`year\` integer,
    \`lyrics_path\` text,
    \`mime_type\` text,
    \`date_added\` text NOT NULL DEFAULT (datetime('now')),
    \`date_modified\` integer
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_mt_library` ON `music_tracks` (`library_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_mt_album` ON `music_tracks` (`album_id`)",
    `CREATE TABLE IF NOT EXISTS \`music_track_artists\` (
    \`track_id\` text NOT NULL REFERENCES \`music_tracks\`(\`id\`) ON DELETE CASCADE,
    \`artist_id\` text NOT NULL REFERENCES \`music_artists\`(\`id\`) ON DELETE CASCADE
  )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS `idx_mta_pk` ON `music_track_artists` (`track_id`, `artist_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_mta_artist` ON `music_track_artists` (`artist_id`)",
    `CREATE TABLE IF NOT EXISTS \`user_track_data\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
    \`track_id\` text NOT NULL REFERENCES \`music_tracks\`(\`id\`) ON DELETE CASCADE,
    \`play_count\` integer DEFAULT 0,
    \`is_favorite\` integer DEFAULT 0,
    \`last_played_at\` text
  )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS `idx_utd_user_track` ON `user_track_data` (`user_id`, `track_id`)",
    // 0039: inline lyrics on music tracks (plain or LRC-timestamped)
    "ALTER TABLE `music_tracks` ADD `lyrics` text",
    // Backfill columns that were only in base CREATE (safe on fresh/new DBs, needed for pre-bootstrap DBs)
    "ALTER TABLE `movies` ADD `video_codec` text",
    "ALTER TABLE `movies` ADD `audio_codec` text",
    "ALTER TABLE `movies` ADD `video_width` integer",
    "ALTER TABLE `movies` ADD `video_height` integer",
    "ALTER TABLE `movies` ADD `audio_channels` integer",
    "ALTER TABLE `movies` ADD `container` text",
    "ALTER TABLE `media_libraries` ADD `scraper_enabled` integer NOT NULL DEFAULT 0",
    "ALTER TABLE `users` ADD `locale` text DEFAULT 'en'",
    // 0040: TV series domain tables
    `CREATE TABLE IF NOT EXISTS \`tv_shows\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`title\` text NOT NULL,
    \`original_title\` text,
    \`sort_name\` text,
    \`overview\` text,
    \`tagline\` text,
    \`folder_path\` text NOT NULL,
    \`poster_path\` text,
    \`fanart_path\` text,
    \`nfo_path\` text,
    \`poster_mtime\` real,
    \`fanart_mtime\` real,
    \`poster_blur\` text,
    \`community_rating\` real,
    \`official_rating\` text,
    \`premiere_date\` text,
    \`year\` integer,
    \`status\` text,
    \`genres\` text,
    \`studios\` text,
    \`country\` text,
    \`tmdb_id\` text,
    \`imdb_id\` text,
    \`tvdb_id\` text,
    \`season_count\` integer,
    \`episode_count\` integer,
    \`tags\` text,
    \`media_library_id\` text NOT NULL REFERENCES \`media_libraries\`(\`id\`) ON DELETE CASCADE,
    \`date_added\` text NOT NULL DEFAULT (datetime('now'))
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_tv_shows_library` ON `tv_shows` (`media_library_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_tv_shows_year` ON `tv_shows` (`year`)",
    "CREATE INDEX IF NOT EXISTS `idx_tv_shows_date_added` ON `tv_shows` (`date_added`)",
    `CREATE TABLE IF NOT EXISTS \`tv_seasons\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`show_id\` text NOT NULL REFERENCES \`tv_shows\`(\`id\`) ON DELETE CASCADE,
    \`season_number\` integer NOT NULL,
    \`title\` text,
    \`overview\` text,
    \`poster_path\` text,
    \`poster_mtime\` real,
    \`poster_blur\` text,
    \`premiere_date\` text,
    \`year\` integer,
    \`tmdb_id\` text,
    \`episode_count\` integer,
    \`date_added\` text NOT NULL DEFAULT (datetime('now'))
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_tv_seasons_show` ON `tv_seasons` (`show_id`)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `idx_tv_seasons_show_num` ON `tv_seasons` (`show_id`, `season_number`)",
    `CREATE TABLE IF NOT EXISTS \`tv_episodes\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`show_id\` text NOT NULL REFERENCES \`tv_shows\`(\`id\`) ON DELETE CASCADE,
    \`season_id\` text NOT NULL REFERENCES \`tv_seasons\`(\`id\`) ON DELETE CASCADE,
    \`season_number\` integer NOT NULL,
    \`episode_number\` integer NOT NULL,
    \`episode_number_end\` integer,
    \`absolute_number\` integer,
    \`title\` text,
    \`overview\` text,
    \`file_path\` text NOT NULL UNIQUE,
    \`nfo_path\` text,
    \`still_path\` text,
    \`still_mtime\` real,
    \`still_blur\` text,
    \`air_date\` text,
    \`community_rating\` real,
    \`runtime_seconds\` integer,
    \`runtime_minutes\` integer,
    \`video_codec\` text,
    \`audio_codec\` text,
    \`video_width\` integer,
    \`video_height\` integer,
    \`audio_channels\` integer,
    \`container\` text,
    \`total_bitrate\` integer,
    \`file_size\` integer,
    \`format_name\` text,
    \`date_modified\` integer,
    \`tmdb_id\` text,
    \`date_added\` text NOT NULL DEFAULT (datetime('now'))
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_tv_ep_show` ON `tv_episodes` (`show_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_tv_ep_season` ON `tv_episodes` (`season_id`)",
    "CREATE UNIQUE INDEX IF NOT EXISTS `idx_tv_ep_season_num` ON `tv_episodes` (`season_id`, `episode_number`)",
    "CREATE INDEX IF NOT EXISTS `idx_tv_ep_date_added` ON `tv_episodes` (`date_added`)",
    `CREATE TABLE IF NOT EXISTS \`tv_people\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`name\` text NOT NULL,
    \`type\` text NOT NULL,
    \`photo_path\` text,
    \`photo_mtime\` real,
    \`photo_blur\` text,
    \`fanart_path\` text,
    \`height\` integer,
    \`weight\` integer,
    \`measurements\` text,
    \`cup_size\` text,
    \`whr\` real,
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
    "CREATE INDEX IF NOT EXISTS `idx_tv_people_name` ON `tv_people` (`name`)",
    `CREATE TABLE IF NOT EXISTS \`tv_show_people\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`show_id\` text NOT NULL REFERENCES \`tv_shows\`(\`id\`) ON DELETE CASCADE,
    \`person_id\` text NOT NULL REFERENCES \`tv_people\`(\`id\`) ON DELETE CASCADE,
    \`role\` text,
    \`sort_order\` integer,
    \`age_at_release\` integer
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_tsp_show` ON `tv_show_people` (`show_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_tsp_person` ON `tv_show_people` (`person_id`)",
    `CREATE TABLE IF NOT EXISTS \`tv_media_streams\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`episode_id\` text NOT NULL REFERENCES \`tv_episodes\`(\`id\`) ON DELETE CASCADE,
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
    \`pix_fmt\` text,
    \`level\` integer,
    \`has_b_frames\` integer,
    \`channels\` integer,
    \`channel_layout\` text,
    \`sample_rate\` integer
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_tms_ep` ON `tv_media_streams` (`episode_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_tms_ep_type` ON `tv_media_streams` (`episode_id`, `stream_type`)",
    `CREATE TABLE IF NOT EXISTS \`user_episode_data\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
    \`episode_id\` text NOT NULL REFERENCES \`tv_episodes\`(\`id\`) ON DELETE CASCADE,
    \`playback_position_seconds\` integer DEFAULT 0,
    \`play_count\` integer DEFAULT 0,
    \`is_played\` integer DEFAULT 0,
    \`personal_rating\` real,
    \`last_played_at\` text,
    \`vr_layout\` text
  )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS `idx_ued_user_ep` ON `user_episode_data` (`user_id`, `episode_id`)",
    `CREATE TABLE IF NOT EXISTS \`user_tv_show_data\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
    \`show_id\` text NOT NULL REFERENCES \`tv_shows\`(\`id\`) ON DELETE CASCADE,
    \`is_favorite\` integer DEFAULT 0,
    \`personal_rating\` real,
    \`dimension_ratings\` text,
    \`last_played_at\` text
  )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS `idx_utsd_user_show` ON `user_tv_show_data` (`user_id`, `show_id`)",
    `CREATE TABLE IF NOT EXISTS \`tv_episode_bookmarks\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
    \`episode_id\` text NOT NULL REFERENCES \`tv_episodes\`(\`id\`) ON DELETE CASCADE,
    \`timestamp_seconds\` integer NOT NULL,
    \`icon_type\` text DEFAULT 'bookmark',
    \`tags\` text,
    \`note\` text,
    \`thumbnail_path\` text,
    \`thumbnail_aspect\` real,
    \`view_state\` text,
    \`created_at\` text NOT NULL DEFAULT (datetime('now'))
  )`,
    "CREATE INDEX IF NOT EXISTS `idx_teb_user_ep` ON `tv_episode_bookmarks` (`user_id`, `episode_id`)",
    "CREATE INDEX IF NOT EXISTS `idx_teb_ep` ON `tv_episode_bookmarks` (`episode_id`)",
    "ALTER TABLE `user_preferences` ADD `tv_show_rating_dimensions` text",
    "ALTER TABLE `user_preferences` ADD `tv_show_dimension_weights` text",
    // 0041: TV↔Cinema parity round 2 — isolated TV person data + TV badge/hero prefs
    `CREATE TABLE IF NOT EXISTS \`user_tv_person_data\` (
    \`id\` text PRIMARY KEY NOT NULL,
    \`user_id\` text NOT NULL REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
    \`person_id\` text NOT NULL REFERENCES \`tv_people\`(\`id\`) ON DELETE CASCADE,
    \`personal_rating\` real,
    \`dimension_ratings\` text,
    \`is_favorite\` integer DEFAULT 0
  )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS `idx_utpd_user_person` ON `user_tv_person_data` (`user_id`, `person_id`)",
    "ALTER TABLE `user_preferences` ADD `show_tv_show_rating_badge` integer NOT NULL DEFAULT 1",
    "ALTER TABLE `user_preferences` ADD `show_tv_resolution_badge` integer NOT NULL DEFAULT 1",
    "ALTER TABLE `user_preferences` ADD `tv_hero_mosaic_config` text",
  ];
  for (const stmt of pending) {
    try {
      sqlite.exec(stmt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Benign: column/table/index already exists (idempotent re-run). Anything
      // else is a real migration failure — log it (non-fatal) so it's visible.
      if (!/duplicate column name|already exists/i.test(msg)) {
        console.error("[db migration] statement failed:", stmt, msg);
      }
    }
  }

  // 0027: Migrate absolute photoPath to relative (idempotent — skips already-relative paths)
  // Extracts "metadata/people/..." from any absolute path, regardless of old dataDir
  try {
    const rows = sqlite.prepare("SELECT id, photo_path FROM people WHERE photo_path IS NOT NULL").all() as Array<{ id: string; photo_path: string }>;
    const update = sqlite.prepare("UPDATE people SET photo_path = ? WHERE id = ?");
    const MARKER = "metadata/people/";
    for (const row of rows) {
      const p = row.photo_path;
      if (!path.isAbsolute(p)) continue; // already relative
      const normalized = p.replace(/\\/g, "/");
      const idx = normalized.indexOf(MARKER);
      if (idx >= 0) {
        update.run(normalized.slice(idx), row.id);
      }
    }
  } catch { /* non-critical */ }

  _db = drizzle(sqlite, { schema });
  return _db;
}

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop, receiver) {
    const realDb = initDb();
    return Reflect.get(realDb, prop, receiver);
  },
});

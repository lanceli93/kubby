import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Users ──────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  locale: text("locale").default("en"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Settings (key-value) ──────────────────────────────────────
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── Media Libraries ────────────────────────────────────────────
export const mediaLibraries = sqliteTable("media_libraries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["movie", "tvshow", "music", "book", "photo"] }).notNull().default("movie"),
  folderPath: text("folder_path").notNull(),
  scraperEnabled: integer("scraper_enabled", { mode: "boolean" }).notNull().default(false),
  jellyfinCompat: integer("jellyfin_compat", { mode: "boolean" }).notNull().default(false),
  metadataLanguage: text("metadata_language"),
  lastScannedAt: text("last_scanned_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ─── Movies ─────────────────────────────────────────────────────
export const movies = sqliteTable("movies", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  sortName: text("sort_name"),
  overview: text("overview"),
  tagline: text("tagline"),
  filePath: text("file_path").notNull(),
  folderPath: text("folder_path").notNull(),
  posterPath: text("poster_path"),
  fanartPath: text("fanart_path"),
  nfoPath: text("nfo_path"),
  communityRating: real("community_rating"),
  officialRating: text("official_rating"),
  runtimeMinutes: integer("runtime_minutes"),
  runtimeSeconds: integer("runtime_seconds"),
  premiereDate: text("premiere_date"),
  year: integer("year"),
  genres: text("genres"), // JSON array string
  studios: text("studios"), // JSON array string
  country: text("country"),
  tmdbId: text("tmdb_id"),
  imdbId: text("imdb_id"),
  videoCodec: text("video_codec"),
  audioCodec: text("audio_codec"),
  videoWidth: integer("video_width"),
  videoHeight: integer("video_height"),
  audioChannels: integer("audio_channels"),
  container: text("container"),
  totalBitrate: integer("total_bitrate"),
  fileSize: integer("file_size"),
  formatName: text("format_name"),
  discCount: integer("disc_count").default(1),
  posterMtime: real("poster_mtime"),
  fanartMtime: real("fanart_mtime"),
  posterBlur: text("poster_blur"), // tiny base64 data URL for blur placeholder
  tags: text("tags"), // JSON array string
  mediaLibraryId: text("media_library_id").notNull().references(() => mediaLibraries.id, { onDelete: "cascade" }),
  dateAdded: text("date_added").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_movies_library").on(table.mediaLibraryId),
  index("idx_movies_year").on(table.year),
  index("idx_movies_date_added").on(table.dateAdded),
]);

// ─── People ─────────────────────────────────────────────────────
export const people = sqliteTable("people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["actor", "director", "writer", "producer"] }).notNull(),
  photoPath: text("photo_path"),
  photoMtime: real("photo_mtime"),
  photoBlur: text("photo_blur"), // tiny base64 data URL for blur placeholder
  tmdbId: text("tmdb_id"),
  overview: text("overview"),
  birthDate: text("birth_date"),
  birthYear: integer("birth_year"),
  placeOfBirth: text("place_of_birth"),
  deathDate: text("death_date"),
  imdbId: text("imdb_id"),
  tags: text("tags"), // JSON array string
  dateAdded: text("date_added").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_people_name").on(table.name),
]);

// ─── Movie-People (M:N) ────────────────────────────────────────
export const moviePeople = sqliteTable("movie_people", {
  id: text("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  role: text("role"),
  sortOrder: integer("sort_order"),
}, (table) => [
  index("idx_mp_movie").on(table.movieId),
  index("idx_mp_person").on(table.personId),
]);

// ─── User Movie Data ────────────────────────────────────────────
export const userMovieData = sqliteTable("user_movie_data", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  playbackPositionSeconds: integer("playback_position_seconds").default(0),
  currentDisc: integer("current_disc").default(1),
  playCount: integer("play_count").default(0),
  isPlayed: integer("is_played", { mode: "boolean" }).default(false),
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  personalRating: real("personal_rating"),
  dimensionRatings: text("dimension_ratings"), // JSON object, e.g. {"剧情": 9.5, "特效": 8.0}
  lastPlayedAt: text("last_played_at"),
}, (table) => [
  uniqueIndex("idx_umd_user_movie").on(table.userId, table.movieId),
]);

// ─── Movie Bookmarks ──────────────────────────────────────────
export const movieBookmarks = sqliteTable("movie_bookmarks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  timestampSeconds: integer("timestamp_seconds").notNull(),
  discNumber: integer("disc_number").default(1),
  iconType: text("icon_type").default("bookmark"),
  tags: text("tags"),
  note: text("note"),
  thumbnailPath: text("thumbnail_path"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_mb_user_movie").on(table.userId, table.movieId),
  index("idx_mb_movie").on(table.movieId),
]);

// ─── Bookmark Icons (custom user-uploaded) ────────────────────
export const bookmarkIcons = sqliteTable("bookmark_icons", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  imagePath: text("image_path").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_bi_user").on(table.userId),
]);

// ─── User Person Data ──────────────────────────────────────────
export const userPersonData = sqliteTable("user_person_data", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => people.id, { onDelete: "cascade" }),
  personalRating: real("personal_rating"),
  dimensionRatings: text("dimension_ratings"), // JSON object, e.g. {"样貌": 9.5, "身材": 8.0}
}, (table) => [
  uniqueIndex("idx_upd_user_person").on(table.userId, table.personId),
]);

// ─── User Preferences ─────────────────────────────────────────
export const userPreferences = sqliteTable("user_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  movieRatingDimensions: text("movie_rating_dimensions"), // JSON array, e.g. '["剧情","特效"]'
  personRatingDimensions: text("person_rating_dimensions"), // JSON array, e.g. '["样貌","身材","演技"]'
  showMovieRatingBadge: integer("show_movie_rating_badge", { mode: "boolean" }).notNull().default(true),
  showPersonTierBadge: integer("show_person_tier_badge", { mode: "boolean" }).notNull().default(true),
  showPersonRatingBadge: integer("show_person_rating_badge", { mode: "boolean" }).notNull().default(true),
  showResolutionBadge: integer("show_resolution_badge", { mode: "boolean" }).notNull().default(true),
  externalPlayerEnabled: integer("external_player_enabled", { mode: "boolean" }).notNull().default(false),
  externalPlayerName: text("external_player_name"),
  externalPlayerPath: text("external_player_path"),
  externalPlayerMode: text("external_player_mode").default("local"), // "local" | "stream"
  disabledBookmarkIcons: text("disabled_bookmark_icons"), // JSON array of disabled icon IDs
  quickBookmarkTemplate: text("quick_bookmark_template"), // JSON: { iconType?, tags?, note? }
  subtleBookmarkMarkers: integer("subtle_bookmark_markers", { mode: "boolean" }).notNull().default(false),
});

// ─── Movie Discs ──────────────────────────────────────────────
export const movieDiscs = sqliteTable("movie_discs", {
  id: text("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  discNumber: integer("disc_number").notNull(),
  filePath: text("file_path").notNull(),
  label: text("label"),
  posterPath: text("poster_path"),
  runtimeSeconds: integer("runtime_seconds"),
  fileSize: integer("file_size"),
  videoCodec: text("video_codec"),
  audioCodec: text("audio_codec"),
  videoWidth: integer("video_width"),
  videoHeight: integer("video_height"),
  audioChannels: integer("audio_channels"),
  container: text("container"),
  totalBitrate: integer("total_bitrate"),
  formatName: text("format_name"),
}, (table) => [
  index("idx_md_movie").on(table.movieId),
  index("idx_md_movie_disc").on(table.movieId, table.discNumber),
]);

// ─── Media Streams ─────────────────────────────────────────────
export const mediaStreams = sqliteTable("media_streams", {
  id: text("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  discNumber: integer("disc_number").default(1),
  streamIndex: integer("stream_index").notNull(),
  streamType: text("stream_type", { enum: ["video", "audio", "subtitle"] }).notNull(),
  codec: text("codec"),
  profile: text("profile"),
  bitrate: integer("bitrate"),
  language: text("language"),
  title: text("title"),
  isDefault: integer("is_default", { mode: "boolean" }),
  isForced: integer("is_forced", { mode: "boolean" }),
  // Video-specific
  width: integer("width"),
  height: integer("height"),
  bitDepth: integer("bit_depth"),
  frameRate: text("frame_rate"),
  hdrType: text("hdr_type"),
  // Audio-specific
  channels: integer("channels"),
  channelLayout: text("channel_layout"),
  sampleRate: integer("sample_rate"),
}, (table) => [
  index("idx_ms_movie").on(table.movieId),
  index("idx_ms_movie_type").on(table.movieId, table.streamType),
]);

import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// ─── Users ──────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  locale: text("locale").default("en"),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
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
  lastScannedAt: text("last_scanned_at"),
  createdAt: text("created_at").notNull().default("(datetime('now'))"),
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
  premiereDate: text("premiere_date"),
  year: integer("year"),
  genres: text("genres"), // JSON array string
  studios: text("studios"), // JSON array string
  country: text("country"),
  tmdbId: text("tmdb_id"),
  imdbId: text("imdb_id"),
  mediaLibraryId: text("media_library_id").notNull().references(() => mediaLibraries.id, { onDelete: "cascade" }),
  dateAdded: text("date_added").notNull().default("(datetime('now'))"),
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
  tmdbId: text("tmdb_id"),
  overview: text("overview"),
  birthDate: text("birth_date"),
  birthYear: integer("birth_year"),
  placeOfBirth: text("place_of_birth"),
  deathDate: text("death_date"),
  imdbId: text("imdb_id"),
  dateAdded: text("date_added").notNull().default("(datetime('now'))"),
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
  playCount: integer("play_count").default(0),
  isPlayed: integer("is_played", { mode: "boolean" }).default(false),
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  lastPlayedAt: text("last_played_at"),
}, (table) => [
  uniqueIndex("idx_umd_user_movie").on(table.userId, table.movieId),
]);

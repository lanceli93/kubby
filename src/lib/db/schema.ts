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
  fanartPath: text("fanart_path"), // own fanart (not movie fallback)
  height: integer("height"), // cm
  weight: integer("weight"), // kg
  measurements: text("measurements"), // e.g. "88-60-90"
  cupSize: text("cup_size"), // e.g. "C"
  whr: real("whr"), // waist-to-hip ratio, auto-calculated from measurements
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
  ageAtRelease: integer("age_at_release"),
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
  vrLayout: text("vr_layout"), // "mono" | "ou" | "sbs" — VR stereo packing for 360° playback
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
  thumbnailAspect: real("thumbnail_aspect"), // width/height ratio (e.g. 1.78 = 16:9, 0.56 = 9:16)
  viewState: text("view_state"), // JSON: {lon, lat, fov} for 360° bookmarks
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
  dotColor: text("dot_color").default("#ffffff"),
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
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
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
  player360Mode: integer("player_360_mode", { mode: "boolean" }).notNull().default(false),
  movieDimensionWeights: text("movie_dimension_weights"), // JSON object, e.g. '{"Plot":2,"VFX":1}'
  personDimensionWeights: text("person_dimension_weights"), // JSON object, e.g. '{"Appearance":2}'
  tvShowRatingDimensions: text("tv_show_rating_dimensions"), // JSON array, e.g. '["剧情","演技"]'
  tvShowDimensionWeights: text("tv_show_dimension_weights"), // JSON object, e.g. '{"Plot":2}'
  heroMosaicConfig: text("hero_mosaic_config"), // JSON HeroMosaicConfig — home hero poster wall settings
  peopleMosaicConfig: text("people_mosaic_config"), // JSON PeopleMosaicConfig — home People hero poster wall settings
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
  pixFmt: text("pix_fmt"),
  level: integer("level"),
  hasBFrames: integer("has_b_frames"),
  // Audio-specific
  channels: integer("channels"),
  channelLayout: text("channel_layout"),
  sampleRate: integer("sample_rate"),
}, (table) => [
  index("idx_ms_movie").on(table.movieId),
  index("idx_ms_movie_type").on(table.movieId, table.streamType),
]);

// ─── Photo Items (photos domain) ───────────────────────────────
export const photoItems = sqliteTable("photo_items", {
  id: text("id").primaryKey(),
  libraryId: text("library_id").notNull().references(() => mediaLibraries.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull().unique(), // absolute path
  fileName: text("file_name").notNull(),
  isVideo: integer("is_video", { mode: "boolean" }).notNull().default(false),
  takenAt: integer("taken_at"), // epoch ms; EXIF capture time, parsed at scan time, the timeline's sort key
  width: integer("width"),
  height: integer("height"),
  durationSeconds: real("duration_seconds"), // video only
  videoCodec: text("video_codec"), // video only — playback decision inputs
  audioCodec: text("audio_codec"), // video only
  container: text("container"), // video only
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  cameraMake: text("camera_make"),
  cameraModel: text("camera_model"),
  gpsLat: real("gps_lat"),
  gpsLng: real("gps_lng"),
  orientation: integer("orientation"),
  thumbnailPath: text("thumbnail_path"), // relative to data dir
  previewPath: text("preview_path"), // only for browser-unrenderable formats like HEIC
  exifJson: text("exif_json"), // long-tail EXIF JSON fallback
  folderPath: text("folder_path").notNull(), // relative to library root, for v2 albums
  dateAdded: text("date_added").notNull().default(sql`(datetime('now'))`),
  dateModified: integer("date_modified"), // file mtime in ms, for incremental scan diffing
}, (table) => [
  index("idx_pi_library").on(table.libraryId),
  index("idx_pi_taken").on(table.libraryId, table.takenAt),
  index("idx_pi_folder").on(table.folderPath),
  index("idx_pi_video").on(table.isVideo),
]);

// Photo albums — manual, user-created categories WITHIN a photo library
// (not auto-generated from scan folders). A photo can belong to many albums.
export const photoAlbums = sqliteTable("photo_albums", {
  id: text("id").primaryKey(),
  libraryId: text("library_id").notNull().references(() => mediaLibraries.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  coverItemId: text("cover_item_id"), // photo_items.id used as the album cover; null → newest member
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_pa_library").on(table.libraryId),
]);

// Album membership join. Composite unique (album_id, item_id) makes adding an
// already-present photo a no-op (INSERT OR IGNORE).
export const photoAlbumItems = sqliteTable("photo_album_items", {
  albumId: text("album_id").notNull().references(() => photoAlbums.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => photoItems.id, { onDelete: "cascade" }),
  addedAt: text("added_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("idx_pai_pk").on(table.albumId, table.itemId),
  index("idx_pai_item").on(table.itemId),
]);

// ─── Music Artists (music domain) ──────────────────────────────
export const musicArtists = sqliteTable("music_artists", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  sortName: text("sort_name"),
  imagePath: text("image_path"), // relative to data dir
  imageBlur: text("image_blur"), // tiny base64 data URL for blur placeholder
  overview: text("overview"),
  musicbrainzId: text("musicbrainz_id"),
  dateAdded: text("date_added").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_mar_name").on(table.name),
]);

// ─── Music Albums (music domain) ───────────────────────────────
export const musicAlbums = sqliteTable("music_albums", {
  id: text("id").primaryKey(),
  libraryId: text("library_id").notNull().references(() => mediaLibraries.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortTitle: text("sort_title"),
  year: integer("year"),
  coverPath: text("cover_path"), // relative to data dir
  coverBlur: text("cover_blur"), // tiny base64 data URL for blur placeholder
  folderPath: text("folder_path"),
  genres: text("genres"), // JSON array string
  musicbrainzId: text("musicbrainz_id"),
  dateAdded: text("date_added").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_mal_library").on(table.libraryId),
]);

// ─── Music Album-Artists (M:N) ─────────────────────────────────
export const musicAlbumArtists = sqliteTable("music_album_artists", {
  albumId: text("album_id").notNull().references(() => musicAlbums.id, { onDelete: "cascade" }),
  artistId: text("artist_id").notNull().references(() => musicArtists.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("idx_maa_pk").on(table.albumId, table.artistId),
  index("idx_maa_artist").on(table.artistId),
]);

// ─── Music Tracks (music domain) ───────────────────────────────
export const musicTracks = sqliteTable("music_tracks", {
  id: text("id").primaryKey(),
  libraryId: text("library_id").notNull().references(() => mediaLibraries.id, { onDelete: "cascade" }),
  albumId: text("album_id").references(() => musicAlbums.id, { onDelete: "cascade" }), // nullable — tracks with no album tag
  filePath: text("file_path").notNull().unique(), // absolute path
  fileName: text("file_name").notNull(),
  title: text("title").notNull(),
  sortTitle: text("sort_title"),
  trackNumber: integer("track_number"),
  discNumber: integer("disc_number"),
  durationSeconds: real("duration_seconds"),
  codec: text("codec"),
  bitrate: integer("bitrate"),
  sampleRate: integer("sample_rate"),
  channels: integer("channels"),
  fileSize: integer("file_size"),
  genres: text("genres"), // JSON array string
  year: integer("year"),
  lyricsPath: text("lyrics_path"),
  lyrics: text("lyrics"), // inline lyrics text; plain or LRC-timestamped ([mm:ss.xx]) when synced
  mimeType: text("mime_type"),
  dateAdded: text("date_added").notNull().default(sql`(datetime('now'))`),
  dateModified: integer("date_modified"), // file mtime in ms, for incremental scan diffing
}, (table) => [
  index("idx_mt_library").on(table.libraryId),
  index("idx_mt_album").on(table.albumId),
]);

// ─── Music Track-Artists (M:N) ─────────────────────────────────
export const musicTrackArtists = sqliteTable("music_track_artists", {
  trackId: text("track_id").notNull().references(() => musicTracks.id, { onDelete: "cascade" }),
  artistId: text("artist_id").notNull().references(() => musicArtists.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("idx_mta_pk").on(table.trackId, table.artistId),
  index("idx_mta_artist").on(table.artistId),
]);

// ─── User Track Data ───────────────────────────────────────────
export const userTrackData = sqliteTable("user_track_data", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trackId: text("track_id").notNull().references(() => musicTracks.id, { onDelete: "cascade" }),
  playCount: integer("play_count").default(0),
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  lastPlayedAt: text("last_played_at"),
}, (table) => [
  uniqueIndex("idx_utd_user_track").on(table.userId, table.trackId),
]);

// ─── TV Shows (tvshow domain) ──────────────────────────────────
export const tvShows = sqliteTable("tv_shows", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  sortName: text("sort_name"),
  overview: text("overview"),
  tagline: text("tagline"),
  folderPath: text("folder_path").notNull(), // upsert key
  posterPath: text("poster_path"),
  fanartPath: text("fanart_path"),
  nfoPath: text("nfo_path"),
  posterMtime: real("poster_mtime"),
  fanartMtime: real("fanart_mtime"),
  posterBlur: text("poster_blur"), // tiny base64 data URL for blur placeholder
  communityRating: real("community_rating"),
  officialRating: text("official_rating"),
  premiereDate: text("premiere_date"),
  year: integer("year"),
  status: text("status"), // "Continuing" | "Ended"
  genres: text("genres"), // JSON array string
  studios: text("studios"), // JSON array string
  country: text("country"), // JSON array string
  tmdbId: text("tmdb_id"),
  imdbId: text("imdb_id"),
  tvdbId: text("tvdb_id"),
  seasonCount: integer("season_count"), // denormalized, refreshed at scan
  episodeCount: integer("episode_count"), // denormalized, refreshed at scan
  tags: text("tags"), // JSON array string
  mediaLibraryId: text("media_library_id").notNull().references(() => mediaLibraries.id, { onDelete: "cascade" }),
  dateAdded: text("date_added").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_tv_shows_library").on(table.mediaLibraryId),
  index("idx_tv_shows_year").on(table.year),
  index("idx_tv_shows_date_added").on(table.dateAdded),
]);

// ─── TV Seasons ────────────────────────────────────────────────
export const tvSeasons = sqliteTable("tv_seasons", {
  id: text("id").primaryKey(),
  showId: text("show_id").notNull().references(() => tvShows.id, { onDelete: "cascade" }),
  seasonNumber: integer("season_number").notNull(), // 0 = Specials
  title: text("title"),
  overview: text("overview"),
  posterPath: text("poster_path"),
  posterMtime: real("poster_mtime"),
  posterBlur: text("poster_blur"), // tiny base64 data URL for blur placeholder
  premiereDate: text("premiere_date"),
  year: integer("year"),
  tmdbId: text("tmdb_id"),
  episodeCount: integer("episode_count"),
  dateAdded: text("date_added").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_tv_seasons_show").on(table.showId),
  uniqueIndex("idx_tv_seasons_show_num").on(table.showId, table.seasonNumber),
]);

// ─── TV Episodes ───────────────────────────────────────────────
export const tvEpisodes = sqliteTable("tv_episodes", {
  id: text("id").primaryKey(),
  showId: text("show_id").notNull().references(() => tvShows.id, { onDelete: "cascade" }), // redundant direct FK for cheap joins
  seasonId: text("season_id").notNull().references(() => tvSeasons.id, { onDelete: "cascade" }),
  seasonNumber: integer("season_number").notNull(), // denormalized
  episodeNumber: integer("episode_number").notNull(), // denormalized
  episodeNumberEnd: integer("episode_number_end"), // multi-episode single file; null = single
  absoluteNumber: integer("absolute_number"), // anime, nullable, not parsed in v1
  title: text("title"),
  overview: text("overview"),
  filePath: text("file_path").notNull().unique(), // upsert key
  nfoPath: text("nfo_path"),
  stillPath: text("still_path"),
  stillMtime: real("still_mtime"),
  stillBlur: text("still_blur"), // tiny base64 data URL for blur placeholder
  airDate: text("air_date"),
  communityRating: real("community_rating"),
  runtimeSeconds: integer("runtime_seconds"),
  runtimeMinutes: integer("runtime_minutes"),
  videoCodec: text("video_codec"),
  audioCodec: text("audio_codec"),
  videoWidth: integer("video_width"),
  videoHeight: integer("video_height"),
  audioChannels: integer("audio_channels"),
  container: text("container"),
  totalBitrate: integer("total_bitrate"),
  fileSize: integer("file_size"),
  formatName: text("format_name"),
  dateModified: integer("date_modified"), // file mtime in ms, for incremental scan diffing
  tmdbId: text("tmdb_id"),
  dateAdded: text("date_added").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_tv_ep_show").on(table.showId),
  index("idx_tv_ep_season").on(table.seasonId),
  uniqueIndex("idx_tv_ep_season_num").on(table.seasonId, table.episodeNumber),
  index("idx_tv_ep_date_added").on(table.dateAdded),
]);

// ─── TV People (isolated from cinema people) ───────────────────
export const tvPeople = sqliteTable("tv_people", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", { enum: ["actor", "director", "writer", "producer"] }).notNull(),
  photoPath: text("photo_path"),
  photoMtime: real("photo_mtime"),
  photoBlur: text("photo_blur"), // tiny base64 data URL for blur placeholder
  fanartPath: text("fanart_path"), // own fanart (not show fallback)
  height: integer("height"), // cm
  weight: integer("weight"), // kg
  measurements: text("measurements"), // e.g. "88-60-90"
  cupSize: text("cup_size"), // e.g. "C"
  whr: real("whr"), // waist-to-hip ratio, auto-calculated from measurements
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
  index("idx_tv_people_name").on(table.name),
]);

// ─── TV Show-People (M:N) ──────────────────────────────────────
export const tvShowPeople = sqliteTable("tv_show_people", {
  id: text("id").primaryKey(),
  showId: text("show_id").notNull().references(() => tvShows.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => tvPeople.id, { onDelete: "cascade" }),
  role: text("role"),
  sortOrder: integer("sort_order"),
  ageAtRelease: integer("age_at_release"),
}, (table) => [
  index("idx_tsp_show").on(table.showId),
  index("idx_tsp_person").on(table.personId),
]);

// ─── TV Media Streams (keyed on episode, no discNumber) ────────
export const tvMediaStreams = sqliteTable("tv_media_streams", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id").notNull().references(() => tvEpisodes.id, { onDelete: "cascade" }),
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
  pixFmt: text("pix_fmt"),
  level: integer("level"),
  hasBFrames: integer("has_b_frames"),
  // Audio-specific
  channels: integer("channels"),
  channelLayout: text("channel_layout"),
  sampleRate: integer("sample_rate"),
}, (table) => [
  index("idx_tms_ep").on(table.episodeId),
  index("idx_tms_ep_type").on(table.episodeId, table.streamType),
]);

// ─── User Episode Data ─────────────────────────────────────────
export const userEpisodeData = sqliteTable("user_episode_data", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").notNull().references(() => tvEpisodes.id, { onDelete: "cascade" }),
  playbackPositionSeconds: integer("playback_position_seconds").default(0),
  playCount: integer("play_count").default(0),
  isPlayed: integer("is_played", { mode: "boolean" }).default(false),
  personalRating: real("personal_rating"),
  lastPlayedAt: text("last_played_at"),
  vrLayout: text("vr_layout"), // "mono" | "ou" | "sbs" — VR stereo packing for 360° playback
}, (table) => [
  uniqueIndex("idx_ued_user_ep").on(table.userId, table.episodeId),
]);

// ─── User TV Show Data ─────────────────────────────────────────
export const userTvShowData = sqliteTable("user_tv_show_data", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  showId: text("show_id").notNull().references(() => tvShows.id, { onDelete: "cascade" }),
  isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
  personalRating: real("personal_rating"),
  dimensionRatings: text("dimension_ratings"), // JSON object, e.g. {"剧情": 9.5, "演技": 8.0}
  lastPlayedAt: text("last_played_at"), // max of episode activity; drives NextUp show ordering
}, (table) => [
  uniqueIndex("idx_utsd_user_show").on(table.userId, table.showId),
]);

// ─── TV Episode Bookmarks (keyed on episode, no discNumber) ────
export const tvEpisodeBookmarks = sqliteTable("tv_episode_bookmarks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  episodeId: text("episode_id").notNull().references(() => tvEpisodes.id, { onDelete: "cascade" }),
  timestampSeconds: integer("timestamp_seconds").notNull(),
  iconType: text("icon_type").default("bookmark"),
  tags: text("tags"),
  note: text("note"),
  thumbnailPath: text("thumbnail_path"),
  thumbnailAspect: real("thumbnail_aspect"), // width/height ratio (e.g. 1.78 = 16:9, 0.56 = 9:16)
  viewState: text("view_state"), // JSON: {lon, lat, fov} for 360° bookmarks
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_teb_user_ep").on(table.userId, table.episodeId),
  index("idx_teb_ep").on(table.episodeId),
]);

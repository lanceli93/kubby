# Kubby Architecture Reference

## Contents
- [Project Structure](#project-structure)
- [Domains (Cinema + TV + Photos + Music)](#domains-cinema--tv--photos--music)
- [Database Schema (32 tables)](#database-schema-32-tables)
- [API Endpoints](#api-endpoints)
- [Authentication](#authentication)
- [Library Scanner](#library-scanner)
- [Photo Scanner](#photo-scanner)
- [Music Scanner](#music-scanner)
- [Video Playback](#video-playback)
- [Audio Playback](#audio-playback)
- [Frontend Components](#frontend-components)
- [Theme (always dark)](#theme-always-dark)
- [i18n](#i18n)
- [Data Directories](#data-directories)
- [Key Environment Variables](#key-environment-variables)
- [Mobile Responsive Design](#mobile-responsive-design)

## Project Structure

```
kubby/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout (Inter font, NextIntlClientProvider)
│   │   ├── globals.css                   # Tailwind v4 + dark cinema theme + glass-flash animation
│   │   ├── (auth)/                       # Auth route group (no header)
│   │   │   ├── login/page.tsx            # Login (Server Component, redirects to /setup if no users)
│   │   │   └── register/page.tsx
│   │   ├── (setup)/                      # First-time setup (no header, public)
│   │   │   └── setup/setup-wizard.tsx    # 4-step wizard (language → admin → library → done)
│   │   ├── (main)/                       # Main app (SessionProvider + QueryProvider + AppHeader)
│   │   │   ├── layout.tsx                # Main layout (mounts DomainCookieSync + AppHeader + BottomTabs)
│   │   │   ├── page.tsx                  # Cinema home (Tabs: Home/Favorites/People; Home = hero mosaic wall + ScrollRows, Favorites = FavoritesBrowser, People = actor mosaic wall)
│   │   │   ├── photos/                    # 📷 Photos domain
│   │   │   │   ├── page.tsx              # Shell: Timeline|Albums segmented control + library filter + multi-select→add-to-album
│   │   │   │   ├── album/[id]/page.tsx   # Album detail (PhotoGrid scoped by albumId, rename/delete, remove-from-album)
│   │   │   │   └── view/[id]/page.tsx    # Lightbox (full-screen, zoom/pan, prev/next, EXIF panel, add-to-album, inline video)
│   │   │   ├── music/                     # 🎵 Music domain
│   │   │   │   ├── page.tsx              # Shell: Tabs (Albums/Artists/Songs) + recent-albums ScrollRow, infinite scroll + sort dropdown
│   │   │   │   ├── albums/[id]/page.tsx  # Album detail (hero cover + meta + Play all + track list)
│   │   │   │   └── artists/[id]/page.tsx # Artist detail (header + album grid)
│   │   │   ├── movies/
│   │   │   │   ├── page.tsx              # Library browse (Tabs: Movies/Favorites/Genres/Actors)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx          # Movie detail (fanart + poster + metadata + bookmark mode/FrameScrubber + cast)
│   │   │   │       └── play/page.tsx     # Video player (HLS.js, bookmarks, progress save)
│   │   │   ├── people/[id]/page.tsx      # Person detail (filmography + photo gallery)
│   │   │   ├── search/page.tsx           # Search (movies + people + bookmarks)
│   │   │   ├── profile/page.tsx          # Profile (displayName/password/account type)
│   │   │   ├── preferences/              # User preferences (PreferencesSidebar)
│   │   │   │   ├── card-badges/page.tsx        # Card badge toggles
│   │   │   │   ├── ratings-bookmarks/page.tsx  # Rating dimensions / bookmark icons
│   │   │   │   ├── hero-mosaic/page.tsx        # Home hero mosaic + people mosaic config, live preview
│   │   │   │   ├── playback/page.tsx           # External player settings
│   │   │   │   └── language/page.tsx           # Locale switch
│   │   │   └── dashboard/               # Admin area
│   │   │       ├── page.tsx              # Overview (stats + quick actions)
│   │   │       ├── libraries/page.tsx    # Library CRUD + scan + folder picker
│   │   │       ├── scraper/page.tsx      # TMDB API key management
│   │   │       └── users/page.tsx        # User management
│   │   └── api/                          # ~30 API route files
│   ├── components/
│   │   ├── layout/                       # AppHeader (brand domain-switcher dropdown), BottomTabs, AdminSidebar, NavSidebar, GlobalScanBar, DomainCookieSync, PreferencesSidebar
│   │   ├── photos/                       # lightbox-video.tsx (iOS/HEVC-aware inline playback), lightbox-info-panel.tsx (EXIF)
│   │   ├── music/                        # album-card.tsx (square cover + TiltCard/ambilight + play overlay), artist-card.tsx (circular), track-row.tsx, now-playing-bar.tsx (global transport + full-screen overlay), now-playing-bar-gate.tsx (renders bar only when a music library exists)
│   │   ├── movie/
│   │   │   ├── movie-card.tsx            # Poster card (180x270, responsive prop for mobile grid)
│   │   │   ├── bookmark-card.tsx         # Bookmark thumbnail card (320px, hover ambilight glow)
│   │   │   ├── favorites-browser.tsx     # Favorites tab (Movies/Actors sub-tabs, full responsive grid + infinite scroll)
│   │   │   └── frame-scrubber.tsx        # Frame browser panel (two-column: preview+overlay/form, screenshot to gallery)
│   │   ├── home/                         # home-hero.tsx, hero-mosaic.tsx (movie wall), people-hero.tsx (actor wall)
│   │   ├── people/person-card.tsx        # Person card (sm/md/lg sizes)
│   │   ├── library/
│   │   │   ├── library-card.tsx          # Library card (360x200)
│   │   │   ├── add-library-card.tsx      # Dashed "+" card with inline add dialog
│   │   │   └── folder-picker.tsx         # Server filesystem browser dialog
│   │   └── ui/                           # 13 shadcn/ui components
│   ├── lib/
│   │   ├── auth.ts                       # NextAuth full config (DB queries, bcrypt)
│   │   ├── auth.config.ts                # NextAuth lightweight (Edge-compatible, no DB)
│   │   ├── db/
│   │   │   ├── schema.ts                 # Drizzle schema (32 tables, incl. photo_items + photo_albums/photo_album_items + 6 music tables + 10 TV tables)
│   │   │   └── index.ts                  # Proxy lazy-init DB connection (WAL + FK + auto-migrate)
│   │   ├── paths.ts                      # Centralized path management (KUBBY_DATA_DIR; incl. getMusicArtDir → metadata/music-art)
│   │   ├── music/
│   │   │   ├── audio-decider.ts          # direct vs transcode decision by ext (primary) + codec hint (ALAC→transcode)
│   │   │   └── queries.ts                # Batched album/track artist-name + album track-count helpers (GROUP_CONCAT, no N+1) + album track ordering
│   │   ├── scanner/
│   │   │   ├── index.ts                  # Scanner entry — dispatches to photo-scanner (type==="photo") / music-scanner (type==="music"), else movie scan (multi-path, TMDB scrape, DB write)
│   │   │   ├── photo-scanner.ts          # Photo/video scanner (EXIF via exifr, sharp thumbs w/ ffmpeg HEIC fallback, cursor timeline data)
│   │   │   ├── music-scanner.ts          # Music scanner (music-metadata tags, album grouping by albumartist||album, embedded/folder cover art, incremental by mtime+size, concurrency pool of 4)
│   │   │   ├── probe.ts                  # Shared ffprobe wrapper (video codec/resolution/duration)
│   │   │   ├── nfo-parser.ts             # NFO XML parser
│   │   │   └── nfo-writer.ts             # NFO generator (Kodi/Jellyfin compatible)
│   │   ├── transcode/
│   │   │   ├── playback-decider.ts       # direct/remux/transcode decision
│   │   │   ├── ffmpeg-command.ts         # HLS command builder (maxWidth, hw-accel args)
│   │   │   ├── hw-accel.ts              # Hardware encoder auto-detect (VideoToolbox/NVENC/libx264)
│   │   │   └── transcode-manager.ts      # FFmpeg process singleton (globalThis, version key)
│   │   ├── scraper/
│   │   │   ├── index.ts                  # TMDB scraper (search + details + images + NFO gen)
│   │   │   └── folder-parser.ts          # "Inception (2010)" → {title, year}
│   │   ├── tmdb.ts                       # TMDB API client
│   │   ├── hero-mosaic-config.ts         # Home hero movie-wall config (columns/style/angle/library mix/filters), normalize()
│   │   ├── people-mosaic-config.ts       # Home People-tab actor-wall config (tiers/favoritesOnly/gallery), normalize()
│   │   └── image-utils.ts                # Image path resolution
│   ├── i18n/
│   │   ├── config.ts                     # locales: ["en", "zh"]
│   │   ├── request.ts                    # Server: read locale from NEXT_LOCALE cookie
│   │   └── messages/{en,zh}.json         # 22 namespaces (incl. photos, music, tv)
│   ├── providers/
│   │   ├── query-provider.tsx            # TanStack React Query
│   │   ├── session-provider.tsx          # NextAuth session
│   │   ├── scan-provider.tsx             # Global scan state (SSE progress, cross-component)
│   │   └── music-player-provider.tsx     # Global audio player — external store (useSyncExternalStore) + ONE persistent <audio>, mounted unconditionally in (main)/layout.tsx so playback survives navigation
│   └── middleware.ts                     # Route protection (imports auth.config.ts)
├── launcher/                             # Go launcher (system tray + process management)
│   ├── main.go, server.go, tray.go
│   └── paths.go, config.go, secret.go, browser.go
├── scripts/
│   ├── package.ts                        # Cross-platform packaging script
│   └── generate-icon.ts                  # Icon generation (icns/ico/png)
├── installer/windows/kubby.nsi           # NSIS installer script
├── docs/
│   ├── architecture-v03.md               # Historical architecture snapshot (NOT maintained — keep the kubby skill current instead)
│   ├── packaging-guide.md                # Packaging technical deep-dive
│   ├── feature-completed.md              # Completed features log
│   └── feature-request.md               # Pending feature requests
└── .github/workflows/
    ├── release.yml                       # Desktop builds (3 platforms)
    └── docker.yml                        # Docker image (amd64)
```

## Domains (Cinema + TV + Photos + Music)

Kubby is multi-domain. Each media domain has its own tables, scanner branch, API
routes, and homepage; shared infra (library management, image serving, playback
pipeline, auth, i18n) is reused, not forked.

| Concern | 🎬 Cinema | 📺 TV | 📷 Photos | 🎵 Music |
|---------|-----------|-------|-----------|----------|
| Library type | `media_libraries.type = "movie"` | `... = "tvshow"` | `... = "photo"` | `... = "music"` |
| Items table | `movies` (+ discs/streams/people) | `tv_shows` → `tv_seasons` → `tv_episodes` (+ tv_media_streams/tv_people/tv_show_people) | `photo_items` | `music_tracks` (+ albums/artists/joins) |
| Scanner | `scanner/index.ts` (NFO + TMDB) | `scanner/tv-scanner.ts` (SxxExx parse + TMDB TV, 3-level) | `scanner/photo-scanner.ts` (EXIF) | `scanner/music-scanner.ts` (`music-metadata` tags) |
| Homepage | `/` (hero mosaic Tabs) | `/tv` (NextUp + shows grid) | `/photos` (timeline) | `/music` (Albums/Artists/Songs tabs) |
| Detail/view | `/movies/[id]` | `/tv/[id]` (seasons + episodes), `/tv/episodes/[id]/play` | `/photos/view/[id]` (lightbox) | `/music/albums/[id]`, `/music/artists/[id]` |
| API prefix | `/api/movies/*` | `/api/tv/*` (+ `/api/tv/episodes/*`) | `/api/photos/*` | `/api/music/*` |

- **TV mirrors the movie skeleton** (tables/API/user-data/playback) but is a distinct
  domain: three-tier `tv_shows`→`tv_seasons`→`tv_episodes` (episodes carry a redundant
  `show_id` for cheap joins; season 0 = Specials), per-episode progress in
  `user_episode_data`, show-level favorite/rating in `user_tv_show_data`, and its OWN
  isolated cast tables (`tv_people`/`tv_show_people` under `metadata/tv-people/`, never
  the cinema `people` table). Unwatched counts are aggregated live, never stored.
  "Next Up" (`/api/tv?filter=next-up`) orders shows by `user_tv_show_data.lastPlayedAt`
  and returns the first in-progress-or-unwatched episode per show. **TV keeps
  scraper/NFO** (unlike photos/music) — it uses `<tvshow>`/`<episodedetails>` NFO +
  TMDB `/tv` endpoints. The video player is shared with cinema via a `basePath` option
  on `usePlaybackSession`/`useProgressSave` (`/api/tv/episodes/{id}` vs
  `/api/movies/{id}`); the transcode pipeline (`decidePlayback`/`transcode-manager`) is
  domain-agnostic.

- **Photo AND music libraries force `scraper_enabled=false, jellyfin_compat=false,
  metadata_language=null`** (server-side in libraries POST/PUT). The dashboard
  library form hides those fields for both types.
- **Domain switcher**: dropdown on the Kubby brand in `AppHeader`, rendered when
  `useHasPhotoLibrary()` OR `useHasMusicLibrary()` OR `useHasTvLibrary()` is true (all
  reuse the `["libraries"]` React Query cache — no extra request). Order is Cinema →
  TV → Photos → Music. This dropdown is the only cross-domain jump point.
- **Domain-following chrome**: `NavSidebar` and `BottomTabs` show only the *current*
  domain's media entry (All Movies / All TV / All Photos / All Music) rather than one
  entry per existing library. Current domain comes from `useCurrentDomain()`
  (`hooks/use-current-domain.ts`, `MediaDomain = cinema|tv|photos|music`): path-owned
  routes (`/movies|/people|/metadata|/` → cinema, `/tv` → tv, `/photos` → photos,
  `/music` → music) decide directly; neutral pages (search/profile/preferences/
  dashboard) fall back to the `kubby-domain` cookie via `useSyncExternalStore` (SSR
  snapshot `cinema`, corrected after hydration). Cinema-only nav (the Metadata group:
  scraper + browse) is gated to `domain === "cinema"`.
- **`DomainCookieSync`** (mounted in `(main)/layout.tsx`) writes a `kubby-domain`
  cookie (`cinema`/`tv`/`photos`/`music`) as the user navigates, so the root can jump
  to the right homepage. The Edge proxy redirect in `auth.config.ts` reads the cookie
  but **can't query the DB**, so DomainCookieSync self-heals a stale `tv`/`photos`/
  `music` cookie to `cinema` when no library of that type exists (else `/` would bounce
  to an empty domain page with no nav entry). The `/`→domain redirect only fires on
  direct entry (`sec-fetch-site: none`) so in-app links to `/` still work.
- **Theme is shared** — photos and music both use the same dark cinema tokens, not a
  separate light theme (explicit user decision).

## Database Schema (32 tables)

### Core tables

**users**: id, username, password_hash, display_name, is_admin, locale, created_at

**settings**: key (PK), value — global key-value config (e.g., `tmdb_api_key`)

**media_libraries**: id, name, type (movie/tvshow/music/book/**photo**), folder_path, scraper_enabled, jellyfin_compat, metadata_language, **is_demo** (Demo Mode allowlist — migration 0042), last_scanned_at, created_at

**movies**: id, title, original_title, sort_name, overview, tagline, file_path, folder_path, poster_path (relative), fanart_path (relative), nfo_path, community_rating, official_rating, runtime_minutes, premiere_date, year, genres (JSON array), studios (JSON array), country, video_codec, audio_codec, video_width, video_height, audio_channels, container, total_bitrate, file_size, format_name, disc_count, duration_seconds, tmdb_id, imdb_id, media_library_id (FK CASCADE), date_added
- Indexes: media_library_id, year, date_added
- poster_path/fanart_path are relative to folder_path; API resolves to absolute before returning

**people**: id, name, type (actor/director/writer/producer), photo_path, biography, birth_date, death_date, birth_place, tmdb_id

**movie_people** (M:N): id, movie_id (FK), person_id (FK), role, sort_order

### User data tables

**user_movie_data**: id, user_id (FK), movie_id (FK), playback_position_seconds, current_disc, play_count, is_played, is_favorite, personal_rating, dimension_ratings (JSON object), last_played_at
- Unique: (user_id, movie_id)

**user_person_data**: id, user_id (FK), person_id (FK), personal_rating, dimension_ratings (JSON)

**user_preferences**: id, user_id (FK UNIQUE), movie_rating_dimensions (JSON array), person_rating_dimensions (JSON array), show_movie_rating_badge, show_person_tier_badge, show_person_rating_badge, show_resolution_badge, external_player_enabled, external_player_name, external_player_path, external_player_mode, disabled_bookmark_icons (JSON), quick_bookmark_template (JSON), subtle_bookmark_markers, player_360_mode, movie_dimension_weights (JSON), person_dimension_weights (JSON), hero_mosaic_config (JSON — home movie wall), people_mosaic_config (JSON — home actor wall)

### Media info tables

**movie_discs**: id, movie_id (FK), disc_number, file_path, label, poster_path, runtime_seconds, file_size, video_codec, audio_codec, video_width, video_height, audio_channels, container, total_bitrate, format_name, duration_seconds

**media_streams**: id, movie_id (FK), disc_number, stream_index, stream_type (video/audio/subtitle), codec, profile, bitrate, language, title, is_default, is_forced, width, height, bit_depth, frame_rate, hdr_type, channels, channel_layout, sample_rate

### Bookmark tables

**movie_bookmarks**: id, user_id (FK), movie_id (FK), timestamp_seconds, disc_number, icon_type, tags (JSON), note, thumbnail_path, created_at

**bookmark_icons**: id, user_id (FK), label, image_path, dot_color, created_at

### Photos domain tables

**photo_items**: id, library_id (FK CASCADE), file_path (UNIQUE, absolute), file_name, is_video (bool), taken_at (epoch ms — EXIF capture time, **the timeline sort key**), width, height, duration_seconds (video), video_codec/audio_codec/container (video — playback decision inputs), file_size, mime_type, camera_make, camera_model, gps_lat, gps_lng, orientation, thumbnail_path (rel to data dir), preview_path (only for browser-unrenderable formats like HEIC), exif_json (long-tail EXIF fallback), folder_path (rel to library root — scan-source dir only; **albums are unrelated to it**), date_added, date_modified (file mtime ms, for incremental scan diffing)
- Indexes: `idx_pi_library` (library_id), `idx_pi_taken` (library_id, taken_at — timeline cursor), `idx_pi_folder` (folder_path), `idx_pi_video` (is_video)
- Photos + videos share one table (`is_video` flag); a photo library is a merged media type, not separate photo/video libraries.

**photo_albums**: id, library_id (FK CASCADE — an album belongs to one photo library), name, cover_item_id (a photo_items.id; falls back to newest member when null or no longer a member), sort_order, created_at. Index: `idx_pa_library`.
- **Albums are manual, user-created categories** (not auto-generated from scan folders — explicit user requirement). Default state is no albums = one timeline. A photo can be in many albums.

**photo_album_items**: album_id (FK CASCADE), item_id (FK CASCADE), added_at. Unique index `idx_pai_pk` (album_id, item_id) makes re-adding a no-op (`onConflictDoNothing`); `idx_pai_item` (item_id). Deleting an album (or removing members) never touches the underlying photos.

### Music domain tables (migration 0038; `music_tracks.lyrics` added 0039)

Six tables. Artists are aggregated **only via the join tables** (`music_album_artists` /
`music_track_artists`) — never physical folders — so Various-Artists albums resolve
naturally. Cover art is stored under `metadata/music-art/{libraryId}/{albumId}.jpg`
(`getMusicArtDir()` in paths.ts), relative path in DB.

**music_artists**: id, name (UNIQUE), sort_name, image_path, image_blur, overview, musicbrainz_id, date_added. Index `idx_mar_name` (name).

**music_albums**: id, library_id (FK CASCADE), title, sort_title, year, cover_path (rel), cover_blur, folder_path, genres (JSON text), musicbrainz_id, date_added. Index `idx_mal_library` (library_id).

**music_album_artists** (M:N): album_id (FK CASCADE), artist_id (FK CASCADE). Unique `idx_maa_pk` (album_id, artist_id); `idx_maa_artist` (artist_id).

**music_tracks**: id, library_id (FK CASCADE), album_id (FK CASCADE, **nullable** — tracks with no album tag → "Unknown Album"), file_path (UNIQUE), file_name, title, sort_title, track_number, disc_number, duration_seconds (real), codec, bitrate, sample_rate, channels, file_size, genres (JSON text), year, lyrics_path (legacy/unused), lyrics (inline text — plain, or LRC `[mm:ss.xx]` when synced; `""` = "checked, none"), mime_type, date_added, date_modified (int ms, for incremental scan). Indexes `idx_mt_library` (library_id), `idx_mt_album` (album_id).

**music_track_artists** (M:N): track_id (FK CASCADE), artist_id (FK CASCADE). Unique `idx_mta_pk` (track_id, artist_id); `idx_mta_artist` (artist_id).

**user_track_data**: id, user_id (FK CASCADE), track_id (FK CASCADE), play_count (default 0), is_favorite (default 0), last_played_at. Unique (user_id, track_id).

### TV domain tables (migration 0040, +`user_tv_person_data` in 0041)

Ten tables. Three-tier hierarchy; cast is isolated from cinema (`tv_people`, photos
under `metadata/tv-people/` via `getTvPeopleMetadataDir()`). Show/season/episode
poster/fanart/still paths are relative to the show `folder_path`. Episode progress is
per-episode; season/show unwatched counts are computed live, not stored.

**tv_shows**: id, title, original_title, sort_name, overview, tagline, folder_path (upsert key), poster_path, fanart_path, nfo_path, poster_mtime, fanart_mtime, poster_blur, community_rating, official_rating, premiere_date, year, status ("Continuing"/"Ended"), genres (JSON), studios (JSON), country (plain string, e.g. "US" — NOT JSON), tmdb_id, imdb_id, tvdb_id, season_count, episode_count (denormalized, refreshed at scan), tags (JSON), media_library_id (FK CASCADE), date_added. Indexes: library, year, date_added.

**tv_seasons**: id, show_id (FK CASCADE), season_number (0 = Specials), title, overview, poster_path, poster_mtime, poster_blur, premiere_date, year, tmdb_id, episode_count, date_added. Unique (show_id, season_number).

**tv_episodes**: id, show_id (FK CASCADE, **redundant** direct FK for cheap joins), season_id (FK CASCADE), season_number + episode_number (denormalized), episode_number_end (multi-episode single file `S01E01-E03`; null=single), absolute_number (anime — nullable, **NOT parsed in v1**, column reserved), title, overview, file_path (UNIQUE, upsert key), nfo_path, still_path, still_mtime, still_blur, air_date, community_rating, runtime_seconds, runtime_minutes, ffprobe flat fields (video_codec/audio_codec/video_width/video_height/audio_channels/container/total_bitrate/file_size/format_name), date_modified (int ms, incremental scan), tmdb_id, date_added. Indexes: show, season, unique (season_id, episode_number), date_added.

**tv_people** / **tv_show_people**: exact column sets of `people` / `movie_people`, but isolated (cast stored at show level). tv_show_people: id, show_id (FK CASCADE), person_id (FK CASCADE), role, sort_order, age_at_release.

**tv_media_streams**: copy of `media_streams` keyed on episode_id (NO disc_number — episodes are single-file). Carries profile/pix_fmt/level/has_b_frames for the iOS-HEVC decide check.

**user_episode_data**: id, user_id (FK CASCADE), episode_id (FK CASCADE), playback_position_seconds, play_count, is_played, personal_rating, last_played_at, vr_layout. Unique (user_id, episode_id).

**user_tv_show_data**: id, user_id (FK CASCADE), show_id (FK CASCADE), is_favorite, personal_rating, dimension_ratings (JSON — reuses movie rating-dimension system via `tv_show_rating_dimensions`/`tv_show_dimension_weights` on user_preferences), last_played_at (max of episode activity; drives Next Up ordering). Unique (user_id, show_id).

**tv_episode_bookmarks**: copy of `movie_bookmarks` keyed on episode_id (NO disc_number). id, user_id (FK CASCADE), episode_id (FK CASCADE), timestamp_seconds, icon_type, tags, note, thumbnail_path, thumbnail_aspect, view_state, created_at.

**user_tv_person_data** (migration 0041): exact peer of `user_person_data` but isolated — person_id FK CASCADE references **`tv_people`**, never cinema `people`. id, user_id (FK CASCADE), personal_rating, dimension_ratings (JSON — TV people REUSE the cinema `person_rating_dimensions`/`person_dimension_weights` prefs; a person's rating dimensions are cross-domain user taste, so sharing the preference is correct), is_favorite. Unique (user_id, person_id). Backs TV cast favorite/rating on `/tv/people/[id]` and the show-detail cast cards.

Migration 0041 also adds three `user_preferences` columns: `show_tv_show_rating_badge`, `show_tv_resolution_badge` (TV card badges), `tv_hero_mosaic_config` (JSON — TV home poster-wall config, peer of `hero_mosaic_config`).

### ER relationships

```
users ──1:N──> user_movie_data ──N:1──> movies
users ──1:N──> user_person_data ──N:1──> people
users ──1:1──> user_preferences
users ──1:N──> movie_bookmarks ──N:1──> movies
users ──1:N──> bookmark_icons
media_libraries ──1:N──> movies ──1:N──> movie_people ──N:1──> people
   (type=movie)                    ├──1:N──> movie_discs
                                   └──1:N──> media_streams
media_libraries ──1:N──> photo_items <──N:M──> photo_albums
   (type=photo)     └──1:N──> photo_albums ──1:N──> photo_album_items ──N:1──> photo_items
media_libraries ──1:N──> music_albums ──1:N──> music_tracks (album_id nullable)
   (type=music)     ├──1:N──> music_tracks                    └──N:M──> music_artists (via music_track_artists)
                    └──> music_albums ──N:M──> music_artists (via music_album_artists)
users ──1:N──> user_track_data ──N:1──> music_tracks
media_libraries ──1:N──> tv_shows ──1:N──> tv_seasons ──1:N──> tv_episodes ──1:N──> tv_media_streams
   (type=tvshow)          ├──1:N──> tv_show_people ──N:1──> tv_people (isolated from cinema people)
                          └──(tv_episodes also carry redundant show_id)
users ──1:N──> user_episode_data ──N:1──> tv_episodes
users ──1:N──> user_tv_show_data ──N:1──> tv_shows
users ──1:N──> user_tv_person_data ──N:1──> tv_people (isolated; never cinema user_person_data)
users ──1:N──> tv_episode_bookmarks ──N:1──> tv_episodes
```

## API Endpoints

### Public (no auth)
- `POST /api/users` — Register (first user = admin)
- `GET /api/setup/status` — `{ needsSetup: boolean }`
- `POST /api/setup/complete` — Create admin + optional library (only when 0 users)
- `/api/auth/*` — NextAuth endpoints

### Authenticated
- `GET /api/movies` — List (params: libraryId, search, sort, limit, exclude, filter, genre, includeGenres, ratingDimension, offset)
- `GET /api/movies/genres` — Genre list by library
- `GET /api/movies/hero-wall` — Home hero mosaic pool (reads/overrides `hero_mosaic_config`)
- `GET /api/people/hero-wall` — Home People-tab mosaic pool (reads/overrides `people_mosaic_config`; flattens photo+fanart+gallery entries)
- `GET /api/tv/hero-wall` — `/tv` home hero mosaic pool (random-samples shows with a poster/fanart). Honors `libraryId`/`genre`/`studio`/`tag` so the wall follows the page's active filter, and now honors the saved `tv_hero_mosaic_config` (peer of the movie wall config).
- `GET /api/tv/genres` — TV genre list by library (peer of `/api/movies/genres`, `tv_shows` only)
- `GET /api/tv/filters` — TV genres/tags/years for the browse-page filter dropdown (peer of `/api/filters`, `tv_shows` only)
- `GET /api/tv/people` — Isolated TV people LIST (sort/filter/showCount + leftJoin `user_tv_person_data` for isFavorite/personalRating); `tv_people`/`tv_show_people`/`tv_shows` only
- `GET /api/tv/people/hero-wall` — TV People-tab mosaic pool (`tv_people` with photos; isolated)
- `GET /api/tv/people/[id]` — Isolated TV person detail (queries `tv_people`/`tv_show_people` ONLY, never cinema `people`); returns bio + shows-appeared-in. Page at `/tv/people/[id]`
- `GET/PUT /api/tv/people/[id]/user-data` — TV cast favorite + multi-dimension rating → `user_tv_person_data` upsert (reuses the cinema `person_rating_dimensions` prefs; NEVER touches cinema `user_person_data`)
- `GET/PUT/DELETE /api/tv/[id]` — Show detail (seasons+episodes+cast with per-cast isFavorite/personalRating+`allPeople`+userData) / edit metadata + cast (writes `tv_people`/`tv_show_people` only, best-effort tvshow NFO writeback) / delete (`?deleteFiles=true`)
- `POST/DELETE /api/tv/[id]/images?type=poster|fanart` — Upload/remove show poster/fanart (fork of the movie images route against `tv_shows`)
- `GET /api/tv/[id]/bookmarks` — Aggregate the user's bookmarks across ALL episodes of a show (read-only; edit/delete stay on the per-episode `/api/tv/episodes/[id]/bookmarks/[bookmarkId]` routes)
- `GET /api/tv/episodes/[id]/media-info` (+ `/raw`) — Episode technical media info (peer of the movie media-info; `tv_media_streams`/`tv_episodes` only)
- `POST /api/tv/episodes/[id]/play-external` — Launch external player for an episode (peer of the movie route; resolves `tv_episodes.file_path`)
- `GET /api/tv` list also honors `genre`/`studio`/`tag` (JSON-text LIKE, mirroring movies) on the grid/count/recently-added, `libraryId` on `filter=next-up`, plus NEW `personId` (filmography — shows a TV person appears in) and `filter=favorites` (favorited shows) branches
- `GET/DELETE /api/movies/[id]` — Detail (with cast/directors/userData) / Delete
- `GET /api/movies/[id]/stream` — Video stream (HTTP 206 Range)
- `GET /api/movies/[id]/stream/decide` — Playback decision (direct/remux/transcode)
- `GET/PUT /api/movies/[id]/user-data` — Progress/favorite/watched/ratings
- `GET/POST /api/movies/[id]/bookmarks` — Bookmark list / create
- `PUT/DELETE /api/movies/[id]/bookmarks/[bookmarkId]` — Update/delete bookmark
- `GET /api/movies/[id]/frame` — Single frame extraction (FFmpeg -ss, JPEG, params: t, disc, maxWidth)
- `POST /api/movies/[id]/play-external` — Launch external player
- `GET /api/people` — List (params: search, sort, limit, offset, filter=favorites, type)
- `GET/PUT /api/people/[id]` — Person detail + filmography
- `GET/PUT /api/people/[id]/user-data` — Person ratings
- `GET/POST/DELETE /api/people/[id]/gallery` — Photo gallery
- `GET/PUT /api/settings/personal-metadata` — User preferences
- `GET/POST /api/settings/bookmark-icons` — Custom bookmark icons
- `PUT/DELETE /api/settings/bookmark-icons/[iconId]`
- `GET/PUT /api/users/me` — Profile (displayName, locale)
- `PUT /api/users/me/password`
- `GET /api/images/[...path]` — Local image serving
- `GET /api/libraries` — Library list
- **Photos domain:**
  - `GET /api/photos?cursor=&limit=&libraryId=&albumId=` — Timeline page (cursor pagination, sorted `taken_at DESC, id DESC`; cursor = `"{takenAt}_{id}"`; `albumId` restricts to an album's members via subquery). Returns `{ items:[{id,isVideo,takenAt,width,height,durationSeconds,fileName}], nextCursor }`
  - `GET /api/photos/[id]` — Full row + parsed `exif` object
  - `GET /api/photos/[id]/thumb` — WebP thumbnail (immutable 1yr cache)
  - `GET /api/photos/[id]/file` — Full image (HEIC→preview, else original; `?original=1` forces download) / video (HTTP 206 Range)
  - `GET /api/photos/[id]/stream/decide` — Video playback decision (reuses `decidePlayback` + transcode-manager; `?noHevc=1` for iOS forces HEVC direct→remux)
  - `GET|POST /api/photos/albums` — List albums (`?libraryId=`, with member count + resolved cover) / create (name+libraryId, photo libraries only)
  - `GET|PATCH|DELETE /api/photos/albums/[id]` — Album header / rename+set-cover / delete (member rows cascade, photos untouched)
  - `POST|DELETE /api/photos/albums/[id]/items` — Add photos (`{itemIds}`, `onConflictDoNothing`, same-library only) / remove photos
- **Music domain:** (all list routes paginate `offset`/`limit` + `search`, return `{ items, totalCount, offset, limit, hasMore }`; artist names via batched `GROUP_CONCAT` in `lib/music/queries.ts`, no N+1; covers served via `/api/images` + `resolveImageSrc(coverPath)`, no dedicated cover route)
  - `GET /api/music/albums?libraryId=&sort=&sortOrder=&search=` — sort title|year|dateAdded (default dateAdded desc); item `{id,title,year,coverPath,coverBlur,artistName,trackCount}`
  - `GET|PUT|DELETE /api/music/albums/[id]` — GET `{...album, genres, artists:[{id,name}], tracks:[{id,title,trackNumber,discNumber,durationSeconds,artistName,isFavorite,playCount}]}` (tracks ordered discNumber, trackNumber); PUT edits `{title,sortTitle,year,genres}`; DELETE `?deleteFiles=true` (cascade tracks + generated cover art; optional source-file removal; prunes orphan artists)
  - `GET /api/music/artists?libraryId=&sort=&search=` — item `{id,name,imagePath,imageBlur,albumCount,trackCount}`
  - `GET|PUT|DELETE /api/music/artists/[id]` — GET `{id,name,imagePath,imageBlur,overview,albums:[...]}`; PUT edits `{name,sortName,overview}` (rename collision → 409); DELETE removes the artist + their whole catalogue (`?deleteFiles=` optional), prunes emptied albums
  - `GET /api/music/songs?libraryId=&sort=&search=` — item `{id,title,durationSeconds,artistName,albumId,albumTitle,coverPath,coverBlur,trackNumber,isFavorite}`
  - `GET /api/music/home?libraryId=` — `{recentAlbums, randomAlbums, mostPlayed}`
  - `PUT|DELETE /api/music/tracks/[id]` — PUT edits `{title,trackNumber,discNumber,year,lyrics}`; DELETE `?deleteFiles=true` (prunes emptied album/artist)
  - `GET|PUT /api/music/tracks/[id]/user-data` — GET `{isFavorite,playCount}`; PUT body `{isFavorite?}` or `{incrementPlay:true}`, upsert on (userId,trackId)
  - `GET /api/music/tracks/[id]/lyrics` — `{lyrics, synced}`; serves the DB `lyrics` column, back-filling on first request for pre-lyrics libraries (parse file → cache; `.lrc` sidecar > embedded `common.lyrics`)
  - `POST /api/music/upload` — multipart audio upload (music libraries only, admin); streams files into `{libraryFolder}/Uploads/` then the client triggers a scan to ingest
  - `GET /api/music/tracks/[id]/stream` — **direct** mode: original file with HTTP 206 Range (mp3/aac/flac/ogg/opus/wav); **transcode** mode: ffmpeg→mp3 pipe (`-f mp3 -ab 192k`, no Range) for wma/aiff/alac/etc. Mode from `decideAudioPlayback` (see Audio Playback)
- HLS streaming: `GET /api/stream/[sessionId]/playlist.m3u8`, `GET /api/stream/[sessionId]/segment/[name]`, `POST/PATCH/DELETE /api/stream/[sessionId]` (POST=seek, PATCH=heartbeat, DELETE=stop)

### Admin only
- `GET/PUT /api/settings/scraper` — TMDB API key
- `POST /api/libraries` — Create library
- `GET/PUT/DELETE /api/libraries/[id]` — Library detail/update/delete
- `POST /api/libraries/[id]/scan` — Trigger scan (SSE progress)
- `GET /api/filesystem` — Server directory browser
- `GET /api/users` — User list
- `PUT/DELETE /api/users/[id]` — Update role/reset password / delete user (last-admin protection)
- `GET /api/dashboard/stats` — Statistics
- `GET /api/dashboard/activity` — Activity log (placeholder)

## Authentication

- **Two-file split**: `auth.config.ts` (Edge middleware, no DB imports) + `auth.ts` (full, bcrypt + DB)
- **JWT payload**: `{ id, isAdmin, locale }`
- **Route protection**: middleware.ts imports auth.config.ts
  - Public: `/login`, `/register`, `/setup`, `/api/setup`, `/api/users` (POST), `/api/auth`
  - Admin: `/dashboard/*`, `POST /api/libraries`, `/api/settings/scraper`, `/api/filesystem`
  - Authenticated: everything else

## Library Scanner

```
scanLibrary(libraryId, onProgress?)
  ├── Load library config (folder paths, scraper_enabled, jellyfin_compat)
  ├── If scraper enabled, load TMDB API key from settings table
  ├── Count all subdirectories → progress total
  ├── For each subdirectory:
  │   ├── No movie.nfo + scraper enabled → scrapeMovie() (TMDB search → details → download images → generate NFO)
  │   ├── No NFO → skip (reason: no_nfo)
  │   ├── Parse NFO (fast-xml-parser) → fail → skip (reason: nfo_parse_error)
  │   ├── Find video files → none → skip (reason: no_video)
  │   ├── Find poster.*/fanart.* images
  │   ├── Probe video with ffprobe (codec, resolution, duration)
  │   ├── Upsert movie (match by folder_path)
  │   ├── Upsert people (match by name + type)
  │   └── Write movie_people associations
  ├── Clean up movies whose folders no longer exist
  └── Return { scannedCount, removedCount, skipped[] }
```

Video extensions: `.mp4`, `.mkv`, `.avi`, `.wmv`, `.mov`, `.flv`, `.webm`, `.m4v`, `.ts`

Expected directory structure:
```
/media/movies/
├── Film1/
│   ├── Film1.mp4       # Video file
│   ├── movie.nfo       # Metadata (Kodi/Jellyfin format)
│   ├── poster.jpg      # Poster image
│   └── fanart.jpg      # Background image
```

## Photo Scanner

`scanPhotoLibrary(library, onProgress?)` in `scanner/photo-scanner.ts`, dispatched
from `scanner/index.ts` when `library.type === "photo"`. The movie code path is
untouched.

```
scanPhotoLibrary
  ├── Recursive walk (skips dotfiles, @eaDir, #recycle, .thumbnails)
  │     image exts: .jpg .jpeg .png .webp .heic .heif .gif .avif
  │     video exts: .mp4 .mov .m4v .3gp
  ├── Incremental: skip if date_modified === mtimeMs && file_size unchanged
  ├── Concurrency pool of 4
  ├── Images: exifr EXIF → sharp 400px WebP thumbnail (ffmpeg fallback);
  │           HEIC/HEIF also get a 2000px preview WebP
  │           taken_at = EXIF DateTimeOriginal > CreateDate > file mtime
  ├── Videos: ffprobe (codec/res/duration) + creation_time → ffmpeg middle-frame thumbnail
  │           taken_at = creation_time > file mtime
  ├── Clean up rows whose files no longer exist
  └── Return { scannedCount, removedCount, skipped[] }
```

> **HEIC 铁律 (Windows):** sharp's libvips on Windows **cannot decode HEIC**
> ("Support for this compression format has not been built in") — but
> `sharp().metadata()` still reads dimensions. **ffmpeg CAN decode HEIC → WebP.**
> So the scanner is sharp-first, ffmpeg-fallback for pixel work, and HEIC/HEIF get
> an extra browser-renderable preview (the lightbox/`file` route serves the preview,
> not the raw HEIC). Do not assume sharp handles HEIC.

Thumbnails/previews live under `metadata/photo-thumbs/` (via
`getPhotoThumbsDir()` in `paths.ts`).

## Music Scanner

`scanMusicLibrary(library, onProgress?)` in `scanner/music-scanner.ts`, dispatched
from `scanner/index.ts` when `library.type === "music"`. The movie/photo code paths
are untouched.

```
scanMusicLibrary
  ├── Recursive walk (skips dotfiles, @eaDir, #recycle, .thumbnails)
  │     audio exts: .mp3 .flac .m4a .aac .ogg .opus .wav .wma .aiff .aif .alac
  ├── Incremental: skip if date_modified === mtimeMs && file_size unchanged
  ├── Concurrency pool of 4
  ├── parseFile() from `music-metadata` per file → title/album/albumartist/
  │     artist(s)/track/disc/year/genre/duration/codec/bitrate/sampleRate/
  │     channels + embedded picture
  ├── Artist splitting (lib/music/artist-split.ts → splitArtistNames): a
  │     collaboration tag ("周杰伦&林迈可", "陈奕迅、王菲", "周杰伦-费玉清") becomes
  │     MULTIPLE artists. Language-aware guard — CJK artists split, Western band
  │     names don't: 、 always; & / ＆ when CJK adjacent on EITHER side; - / －
  │     only when CJK on BOTH sides. So "AC/DC" / "Simon & Garfunkel" / "Jay-Z"
  │     stay intact. Splitting also lets same-title duet + solo tracks share an
  │     artist id → group into one album (below).
  ├── Album grouping: same title (case-insensitive) + shares ≥1 artist (album-
  │     artist ∪ track-artist), matched via an in-memory title→candidates cache
  │     (see getOrCreateAlbum) → Various-Artists / differing per-track artists
  │     still collapse to one album as long as tracks chain through an artist
  ├── Backfill (pre-split libraries): at scan start, split any legacy combined-
  │     artist ROW, rewire its track/album joins to the parts, delete it, then
  │     merge same-title albums that now share an artist (fixed-point,
  │     gap-fills cover/year). Idempotent → runs every scan. See backfillArtistSplits.
  ├── Artists linked ONLY via music_album_artists / music_track_artists (never folders)
  ├── Cover priority: album folder cover.*/folder.*/albumart.*/front.* >
  │     embedded picture (extracted to metadata/music-art/{libraryId}/{albumId}.jpg) > none
  │     coverBlur via generateBlurDataURL (lib/blur-utils)
  ├── Lyrics: `.lrc` sidecar > embedded common.lyrics (synced→LRC, else plain) → music_tracks.lyrics
  ├── Tracks with no album tag → album_id = null ("Unknown Album")
  ├── Clean up rows whose files vanished; delete albums/artists left with no tracks
  └── Return { scannedCount, removedCount, skipped[] }
```

## Video Playback

Photos-domain video reuses this whole pipeline via `/api/photos/[id]/stream/decide`
— same `playback-decider` + `transcode-manager`. iOS passes `?noHevc=1` (HEVC
direct→remux instead of the mediaStreams profile check, which photo videos lack).

### Decision flow
```
GET /api/movies/{id}/stream/decide?disc=N
  → decidePlayback({ container, videoCodec, audioCodec })
  → direct: MP4+H.264+AAC, WebM+VP8/VP9+Opus (browser native)
  → remux: browser-compatible codec, wrong container (MKV/MOV/TS+H.264) — copy streams to HLS
  → transcode: incompatible codec (mpeg4/wmv2/flv1 etc) — re-encode to H.264+AAC HLS
```

### Hardware acceleration (hw-accel.ts)
- Auto-detect priority: `h264_videotoolbox` (macOS) → `h264_nvenc` (NVIDIA) → `libx264` (CPU fallback)
- Detected on first transcode, cached in TranscodeManager singleton
- Runtime fallback: if HW encoder fails, auto-retry with libx264

### FFmpeg args (ffmpeg-command.ts)
- Remux: `-c:v copy -c:a copy -f hls -hls_time 6 -hls_list_size 0`
- Transcode (VideoToolbox): `-vf scale='min({maxWidth},iw)':-2 -c:v h264_videotoolbox -q:v 65 -maxrate 4M -bufsize 8M`
- Transcode (NVENC): `-hwaccel cuda -vf scale='min({maxWidth},iw)':-2 -c:v h264_nvenc -preset p4 -cq 23`
- Transcode (libx264): `-threads 0 -vf scale='min({maxWidth},iw)':-2 -c:v libx264 -preset ultrafast -crf 23`
- `maxWidth` configurable (default 1920): 1920/1280/854/0 (0 = original, skip scale filter)
- Seek: `-ss {seconds}` before `-i`

### TranscodeManager
- globalThis singleton with version key (survives hot reload)
- Temp files: `os.tmpdir()/kubby-transcode/{sessionId}/`
- 15s cleanup interval, 90s idle timeout (client sends 30s PATCH heartbeat)
- seekSession(): delete old session from map first to prevent orphan FFmpeg processes
- SIGTERM + 2s SIGKILL fallback for stubborn processes
- SIGTERM/SIGINT: kill all FFmpeg + cleanup cache

### Client (play/page.tsx)
- Direct play: `video.src = streamUrl`
- HLS: HLS.js `loadSource()` + `attachMedia()` (Safari: native HLS fallback)
- `hlsTimeOffsetRef` tracks FFmpeg `-ss` start point; `getRealTime()` returns true position
- HLS-aware seek: `seekTo()` with 500ms debounce + AbortController, destroy+recreate HLS instance
- 30s PATCH heartbeat to keep session alive
- Backend `durationSeconds` for progress bar (HLS.js reports unreliable duration)
- Mode badge: Direct/Remux/HW/SW with encoder detail popover
- Resolution selector: 原画/1080p/720p/480p (transcode mode only), smart filtering by source width
- Progress saved every 10s via `PUT /api/movies/{id}/user-data`
- Bookmarks: B (quick) / Shift+B (detailed with icon/tags/note)

## Audio Playback

Music does **not** use the HLS pipeline — audio streams straight to a single
persistent `<audio>` element via `/api/music/tracks/[id]/stream`.

### Decision (`lib/music/audio-decider.ts`)
```
decideAudioPlayback({ codec, ext })
  → direct:    ext ∈ {.mp3 .m4a .aac .flac .ogg .oga .opus .wav}  (browser-native)
  → transcode: everything else (wma/aiff/alac/ape/dsf/unknown)
```
- **Extension is the primary signal**; codec is a secondary hint only when the ext
  is unknown/absent. **ALAC is special-cased → transcode** (it lives in an `.m4a`
  container but browsers can't decode it).
- Direct mode serves original bytes with HTTP 206 Range so `<audio>` seeking works.
- Transcode mode pipes ffmpeg `-f mp3 -ab 192k -map_metadata -1 pipe:1` (no Range,
  `Cache-Control: no-store`); the child is SIGKILLed on client `request.signal` abort.

### Global player (`providers/music-player-provider.tsx`)
- **External-store singleton** (`useSyncExternalStore`, same pattern as
  `scan-provider.tsx`): module-level `state` + `listeners` + `emitChange()` swapping a
  new reference. Holds `{ queue, index, isPlaying, currentTime, duration, volume,
  shuffle, repeat }`. Actions (`playTrack`, `playAlbum`, `toggle`, `playPauseTrack`,
  `next`, `prev`, `seek`, `setVolume`, `toggleShuffle`, `cycleRepeat`) are
  module-level singletons — stable identity, no memoization needed by callers.
- **ONE persistent `<audio>`** lives in the provider (hidden, never unmounted),
  mounted **unconditionally** in `(main)/layout.tsx` so navigation never stops
  playback. `useMusicPlayer()` reads live state + returns actions + `currentTrack`.
- **Play-count**: on the `<audio>` `play` event, fire-and-forget
  `PUT /api/music/tracks/[id]/user-data {incrementPlay:true}`, guarded by
  `countedTrackId` so seeking/pausing the same track never re-counts.
- `repeat` cycles off→all→one; `prev` restarts the current track if >3s in.
- **`NowPlayingBar`** (`components/music/now-playing-bar.tsx`): fixed glass bar at
  `bottom-14` (above BottomTabs) / `md:bottom-0`; cover + title/artist + transport +
  seek + volume; clicking the cover/title opens a full-screen Now Playing overlay
  (`fixed inset-0`, blurred cover backdrop). Rendered only when a music library
  exists, via `NowPlayingBarGate` — but the provider/`<audio>` is always mounted.

## Frontend Components

| Component | Size | Key features |
|-----------|------|-------------|
| MovieCard | 180x270 (responsive: w-full+aspect-[2/3]) | Poster, rating/resolution badges; hover: whole-card `scale-[1.03]` + `TiltCard` 3D tilt/glare + ambient glow + centered play + gradient-scrim overlay bar (watched/favorite/more), badges lift on tilt. See feature-patterns → Movie poster card hover |
| PersonCard | sm:140x210, md:160x240, lg:240x340 | Photo, tier badge |
| LibraryCard | 360x200 | Cover image, name overlay, scan progress, hover menu |
| AddLibraryCard | 360x200 | Dashed border, "+" icon, opens add library dialog |
| BookmarkCard | 280px mobile / 320px desktop | Thumbnail, icon, tags, edit/delete |
| ScrollRow | Horizontal scroll | Chevron nav (hidden mobile), snap scroll on touch |
| BottomTabs | Fixed bottom bar | Home / <current-domain media tab> / Search / Settings, md:hidden; media tab follows `useCurrentDomain()` (Movies OR Photos OR Music, not all); hidden on movie play page + photo viewer `/photos/view/[id]` |
| Photos grid | `components/photos/photo-grid.tsx` | Shared month-grouped justified grid (cursor pagination, row-level virtual scroll via `@tanstack/react-virtual`); drives both timeline + album detail, scoped by libraryId/albumId, optional multi-select |
| Photos lightbox | Full-screen | Zoom/pan, prev/next (←/→/swipe), EXIF panel, neighbor preload, inline video (`LightboxVideo`) |
| AlbumCard | square (~180px) | Cover + TiltCard 3D tilt/glare + ambilight glow (like MovieCard) + centered play overlay (plays album), title + artist below → `/music/albums/[id]` |
| ArtistCard | circular | Round image, name + "N albums" → `/music/artists/[id]` |
| TrackRow | List row | Track#, title, artist, duration; hover reveals play + favorite; highlights the current track |
| NowPlayingBar | Fixed bottom bar | Global transport (cover/title/artist + play/next/prev/seek/volume/shuffle/repeat); click cover → full-screen Now Playing overlay; sits above BottomTabs on mobile; gated by `NowPlayingBarGate` |
| GlobalScanBar | Bottom bar | Current scan title + progress, expandable skipped list |

## Theme (always dark)

| Variable | Value | Usage |
|----------|-------|-------|
| --background | #0a0a0f | Page background |
| --foreground | #f0f0f5 | Primary text |
| --surface/--card | #1a1a2e | Cards, surfaces |
| --header/--muted | #111118 | Nav bar, sidebar |
| --primary | #3b82f6 | Blue accent |
| --muted-foreground | #8888a0 | Secondary text |
| --gold | #f5c518 | Ratings |
| --destructive | #ef4444 | Danger actions |
| --border | rgba(255,255,255,0.06) | Borders |

Font: Inter (next/font/google), CJK fallback: PingFang SC → Microsoft YaHei → Noto Sans SC

## i18n

Cookie-driven (`NEXT_LOCALE`), 22 namespaces: common, auth, setup, nav, home, settings, dashboard, movies, search, person, metadata, cardBadges, heroMosaic, peopleHero, preferences, personalMetadata, mediaInfoDialog, player, folderPicker, photos, music, tv.

Language switch: `setLocale()` server action writes cookie → `router.refresh()`. User locale persisted in DB via `PUT /api/users/me`.

## Data Directories

| Platform | Install | Data |
|----------|---------|------|
| macOS | `/Applications/Kubby.app` | `~/Library/Application Support/Kubby/` |
| Windows | `C:\Program Files\Kubby\` | `%LOCALAPPDATA%\Kubby\` |
| Docker | Container | `/data` volume |
| Dev | Project root | `./data/` |

Data directory contents: `kubby.db`, `kubby.db-wal`, `auth-secret`, `config.json`, `logs/`, `metadata/people/`, `metadata/bookmarks/`, `metadata/bookmark-icons/`, `metadata/photo-thumbs/` (photo/video thumbnails + HEIC previews), `metadata/music-art/` (album cover art, per libraryId)

## Key Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| KUBBY_DATA_DIR | Data directory path | `process.cwd()/data` |
| FFPROBE_PATH | ffprobe binary | `ffprobe` (from PATH) |
| FFMPEG_PATH | ffmpeg binary | `ffmpeg` (from PATH) |
| AUTH_SECRET | NextAuth secret | Auto-generated by Go launcher |

## Mobile Responsive Design

Strategy: mobile-first CSS with `md:` prefix (768px breakpoint) for desktop styles.

Key patterns:
- **useIsMobile hook** (`hooks/use-mobile.ts`): `matchMedia("(max-width: 767px)")`, synced with Tailwind `md:`
- **BottomTabs** (`components/layout/bottom-tabs.tsx`): mobile nav (Home / current-domain media tab / Search / Settings), `md:hidden`, hidden on player pages + photo viewer
- **Hero refactoring** (Movie/Person Detail): mobile = fanart banner `h-[220px]` + hidden poster + flow layout; desktop = absolute overlay (unchanged)
- **Grid responsive**: movie grids use `grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,180px)]` with `responsive` MovieCard prop
- **Container padding**: all `px-12`/`px-20` → `px-4 md:px-12`/`px-4 md:px-20`
- **Fixed-width containers**: `w-[720px]` → `w-full max-w-[720px]`, `w-[480px]` → `w-full max-w-[480px]`
- **AdminSidebar**: desktop vertical sidebar (`hidden md:flex`) + mobile horizontal scroll nav (`flex md:hidden`)
- **ScrollRow**: chevrons hidden on mobile, snap scroll enabled (`snap-x snap-mandatory md:snap-none`)
- **Dialogs**: full-screen on mobile (`max-h-[100dvh] rounded-none md:rounded-lg`)
- **Mobile-hidden features**: View fanart button, Bookmark mode toggle (both `hidden md:flex`)

## Doc Maintenance

Per CLAUDE.md instructions:
- After big features: update **this skill** (SKILL.md, references/architecture.md, references/feature-patterns.md) — this doc is the maintained reference, NOT `docs/architecture-v0.x-mvp.md`. Verify against shipped code; grep for stale counts/claims before committing.
- Remove completed items from `docs/feature-request.md`, record in `docs/feature-completed.md`
- Git commit with short message after many code changes

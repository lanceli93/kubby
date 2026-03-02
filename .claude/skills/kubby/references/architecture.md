# Kubby Architecture Reference

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
│   │   │   ├── page.tsx                  # Home (Tabs: Home/Favorites, ScrollRows for libraries/movies)
│   │   │   ├── movies/
│   │   │   │   ├── page.tsx              # Library browse (Tabs: Movies/Favorites/Genres)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx          # Movie detail (fanart + poster + metadata + bookmark mode/FrameScrubber + cast)
│   │   │   │       └── play/page.tsx     # Video player (HLS.js, bookmarks, progress save)
│   │   │   ├── people/[id]/page.tsx      # Person detail (filmography + photo gallery)
│   │   │   ├── search/page.tsx           # Search (movies + people + bookmarks)
│   │   │   ├── settings/page.tsx         # User settings (profile/password/language/external player)
│   │   │   ├── personal-metadata/page.tsx # Rating dimensions / bookmark icons
│   │   │   └── dashboard/               # Admin area
│   │   │       ├── page.tsx              # Overview (stats + quick actions)
│   │   │       ├── libraries/page.tsx    # Library CRUD + scan + folder picker
│   │   │       ├── scraper/page.tsx      # TMDB API key management
│   │   │       └── users/page.tsx        # User management
│   │   └── api/                          # ~30 API route files
│   ├── components/
│   │   ├── layout/                       # AppHeader, AdminSidebar, NavSidebar, GlobalScanBar
│   │   ├── movie/
│   │   │   ├── movie-card.tsx            # Poster card (180x270)
│   │   │   ├── bookmark-card.tsx         # Bookmark thumbnail card (320px)
│   │   │   └── frame-scrubber.tsx        # Frame browser panel (two-column: preview+overlay/form, screenshot to gallery)
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
│   │   │   ├── schema.ts                 # Drizzle schema (13 tables)
│   │   │   └── index.ts                  # Proxy lazy-init DB connection (WAL + FK + auto-migrate)
│   │   ├── paths.ts                      # Centralized path management (KUBBY_DATA_DIR)
│   │   ├── scanner/
│   │   │   ├── index.ts                  # Library scanner (multi-path, TMDB scrape, DB write)
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
│   │   └── image-utils.ts                # Image path resolution
│   ├── i18n/
│   │   ├── config.ts                     # locales: ["en", "zh"]
│   │   ├── request.ts                    # Server: read locale from NEXT_LOCALE cookie
│   │   └── messages/{en,zh}.json         # 12 namespaces
│   ├── providers/
│   │   ├── query-provider.tsx            # TanStack React Query
│   │   ├── session-provider.tsx          # NextAuth session
│   │   └── scan-provider.tsx             # Global scan state (SSE progress, cross-component)
│   └── middleware.ts                     # Route protection (imports auth.config.ts)
├── launcher/                             # Go launcher (system tray + process management)
│   ├── main.go, server.go, tray.go
│   └── paths.go, config.go, secret.go, browser.go
├── scripts/
│   ├── package.ts                        # Cross-platform packaging script
│   └── generate-icon.ts                  # Icon generation (icns/ico/png)
├── installer/windows/kubby.nsi           # NSIS installer script
├── docs/
│   ├── architecture-v0.1-mvp.md          # Full architecture doc (canonical, update this on big changes)
│   ├── packaging-guide.md                # Packaging technical deep-dive
│   ├── feature-completed.md              # Completed features log
│   └── feature-request.md               # Pending feature requests
└── .github/workflows/
    ├── release.yml                       # Desktop builds (3 platforms)
    └── docker.yml                        # Docker image (amd64)
```

## Database Schema (13 tables)

### Core tables

**users**: id, username, password_hash, display_name, is_admin, locale, created_at

**settings**: key (PK), value — global key-value config (e.g., `tmdb_api_key`)

**media_libraries**: id, name, type (movie/tvshow/music), folder_path, scraper_enabled, jellyfin_compat, metadata_language, last_scanned_at, created_at

**movies**: id, title, original_title, sort_name, overview, tagline, file_path, folder_path, poster_path (relative), fanart_path (relative), nfo_path, community_rating, official_rating, runtime_minutes, premiere_date, year, genres (JSON array), studios (JSON array), country, video_codec, audio_codec, video_width, video_height, audio_channels, container, total_bitrate, file_size, format_name, disc_count, duration_seconds, tmdb_id, imdb_id, media_library_id (FK CASCADE), date_added
- Indexes: media_library_id, year, date_added
- poster_path/fanart_path are relative to folder_path; API resolves to absolute before returning

**people**: id, name, type (actor/director/writer/producer), photo_path, biography, birth_date, death_date, birth_place, tmdb_id

**movie_people** (M:N): id, movie_id (FK), person_id (FK), role, sort_order

### User data tables

**user_movie_data**: id, user_id (FK), movie_id (FK), playback_position_seconds, current_disc, play_count, is_played, is_favorite, personal_rating, dimension_ratings (JSON object), last_played_at
- Unique: (user_id, movie_id)

**user_person_data**: id, user_id (FK), person_id (FK), personal_rating, dimension_ratings (JSON)

**user_preferences**: id, user_id (FK UNIQUE), movie_rating_dimensions (JSON array), person_rating_dimensions (JSON array), show_movie_rating_badge, show_person_tier_badge, show_person_rating_badge, show_resolution_badge, external_player_enabled, external_player_name, external_player_path, external_player_mode, disabled_bookmark_icons (JSON), quick_bookmark_template (JSON), subtle_bookmark_markers

### Media info tables

**movie_discs**: id, movie_id (FK), disc_number, file_path, label, poster_path, runtime_seconds, file_size, video_codec, audio_codec, video_width, video_height, audio_channels, container, total_bitrate, format_name, duration_seconds

**media_streams**: id, movie_id (FK), disc_number, stream_index, stream_type (video/audio/subtitle), codec, profile, bitrate, language, title, is_default, is_forced, width, height, bit_depth, frame_rate, hdr_type, channels, channel_layout, sample_rate

### Bookmark tables

**movie_bookmarks**: id, user_id (FK), movie_id (FK), timestamp_seconds, disc_number, icon_type, tags (JSON), note, thumbnail_path, created_at

**bookmark_icons**: id, user_id (FK), label, image_path, dot_color, created_at

### ER relationships

```
users ──1:N──> user_movie_data ──N:1──> movies
users ──1:N──> user_person_data ──N:1──> people
users ──1:1──> user_preferences
users ──1:N──> movie_bookmarks ──N:1──> movies
users ──1:N──> bookmark_icons
media_libraries ──1:N──> movies ──1:N──> movie_people ──N:1──> people
                                  ├──1:N──> movie_discs
                                  └──1:N──> media_streams
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
- `GET/DELETE /api/movies/[id]` — Detail (with cast/directors/userData) / Delete
- `GET /api/movies/[id]/stream` — Video stream (HTTP 206 Range)
- `GET /api/movies/[id]/stream/decide` — Playback decision (direct/remux/transcode)
- `GET/PUT /api/movies/[id]/user-data` — Progress/favorite/watched/ratings
- `GET/POST /api/movies/[id]/bookmarks` — Bookmark list / create
- `PUT/DELETE /api/movies/[id]/bookmarks/[bookmarkId]` — Update/delete bookmark
- `GET /api/movies/[id]/frame` — Single frame extraction (FFmpeg -ss, JPEG, params: t, disc, maxWidth)
- `POST /api/movies/[id]/play-external` — Launch external player
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

## Video Playback

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

## Frontend Components

| Component | Size | Key features |
|-----------|------|-------------|
| MovieCard | 180x270 | Poster, rating/resolution badges, hover: play/favorite/watched/menu |
| PersonCard | sm:140x210, md:160x240, lg:240x340 | Photo, tier badge |
| LibraryCard | 360x200 | Cover image, name overlay, scan progress, hover menu |
| AddLibraryCard | 360x200 | Dashed border, "+" icon, opens add library dialog |
| BookmarkCard | 320px wide | Thumbnail, icon, tags, edit/delete |
| ScrollRow | Horizontal scroll | Chevron nav, overflow detection |
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

Cookie-driven (`NEXT_LOCALE`), 12 namespaces: common, auth, setup, nav, home, settings, dashboard, movies, search, person, personalMetadata, folderPicker.

Language switch: `setLocale()` server action writes cookie → `router.refresh()`. User locale persisted in DB via `PUT /api/users/me`.

## Data Directories

| Platform | Install | Data |
|----------|---------|------|
| macOS | `/Applications/Kubby.app` | `~/Library/Application Support/Kubby/` |
| Windows | `C:\Program Files\Kubby\` | `%LOCALAPPDATA%\Kubby\` |
| Docker | Container | `/data` volume |
| Dev | Project root | `./data/` |

Data directory contents: `kubby.db`, `kubby.db-wal`, `auth-secret`, `config.json`, `logs/`, `metadata/people/`, `metadata/bookmarks/`, `metadata/bookmark-icons/`

## Key Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| KUBBY_DATA_DIR | Data directory path | `process.cwd()/data` |
| FFPROBE_PATH | ffprobe binary | `ffprobe` (from PATH) |
| FFMPEG_PATH | ffmpeg binary | `ffmpeg` (from PATH) |
| AUTH_SECRET | NextAuth secret | Auto-generated by Go launcher |

## Doc Maintenance

Per CLAUDE.md instructions:
- After big features: update `docs/architecture-v0.1-mvp.md` (latest version)
- Remove completed items from `docs/feature-request.md`, record in `docs/feature-completed.md`
- Git commit with short message after many code changes

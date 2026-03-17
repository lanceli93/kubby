# Completed Features

## 2026-03-17: Player Refactoring for VR/360 Support (Phase 0)

Refactored the 1370-line monolithic player page into focused, reusable modules. Pure refactoring with zero behavior change, preparing for future VR/360 panoramic player that will share HLS session management, playback controls, bookmarks, and progress saving.

### New Files
- `src/hooks/use-playback-session.ts` — HLS/direct-play lifecycle, seek (debounced), heartbeat, cleanup, resolution change
- `src/hooks/use-progress-save.ts` — Auto-save interval (10s) + on-demand save mutation
- `src/components/player/player-controls.tsx` — Bottom control bar (seek bar, transport, volume, speed, resolution, fullscreen, bookmark markers)
- `src/components/player/player-overlays.tsx` — OSD message, Help modal, Bookmark panel, Center play button
- `src/components/player/player-top-bar.tsx` — Back button, title, disc counter, help toggle

### Modified Files
- `src/app/(main)/movies/[id]/play/page.tsx` — Slim orchestrator (487 lines, down from 1370): data fetching, hook wiring, keyboard shortcuts, controls visibility, bookmark mutations
- `docs/architecture-v0.2.md` — Updated directory structure to reflect new player modules

## 2026-03-15: Favorite Actors Feature

Added person/actor favoriting support and redesigned both Favorites tabs (Home + Movies page) to show favorite movies and favorite actors as separate ScrollRows.

### Changes
- **DB**: Added `is_favorite` column to `user_person_data` table (migration #0022)
- **API**: `GET/PUT /api/people/[id]/user-data` handles `isFavorite`; `/api/people` supports `filter=favorites` and returns `isFavorite` field
- **PersonCard**: Heart toggle button on hover overlay (left side), matching MovieCard pattern
- **Person Detail Page**: Heart button in badges row between rating/fanart buttons
- **Movies Page Favorites Tab**: Redesigned to show two ScrollRows (Favorite Movies + Favorite Actors) with clickable titles navigating to full grid views (`?view=movies` / `?view=actors`) with back navigation
- **Home Page Favorites Tab**: Two ScrollRows with clickable titles linking to Movies page grid views
- **i18n**: Added keys for `favoriteMovies`, `favoriteActors`, `noFavoriteActors` in en/zh

### Key Files Modified
- `src/lib/db/schema.ts`, `src/lib/db/index.ts` — schema + migration
- `src/app/api/people/[id]/user-data/route.ts` — isFavorite in GET/PUT
- `src/app/api/people/route.ts` — filter=favorites, isFavorite in response
- `src/app/api/people/[id]/route.ts` — isFavorite in userData
- `src/components/people/person-card.tsx` — Heart toggle props
- `src/app/(main)/people/[id]/page.tsx` — Heart button + toggleFavorite mutation
- `src/app/(main)/movies/page.tsx` — FavoritesOverview, FavoritesMoviesGrid, FavoritesActorsGrid; togglePersonFavorite in usePersonMutations
- `src/app/(main)/page.tsx` — Two ScrollRows in Favorites tab
- `src/i18n/messages/en.json`, `src/i18n/messages/zh.json`

## 2026-03-15: v0.2.3 — Cinema Indigo & Fluid Glass Visual Upgrade

Comprehensive visual overhaul with Cinema Indigo + Gold color scheme (`#6366f1` / `#ca8a04`) and fluid glassmorphism design system.

### Changes
- **Color scheme**: replaced all blue with Cinema Indigo + Gold tokens
- **Glass utilities**: `.glass-cinema`, `.glass-badge`, `.glass-btn`, `.glass-card` in `globals.css`
- **Glass treatment**: applied to nav sidebar, sort/filter dropdowns, detail page info panels
- **Backdrop-filter blur**: detail page glass panels use Tailwind `backdrop-blur-[20px]` (not `.glass-cinema` CSS class — Tailwind v4 specificity issue)
- **Tab bar**: unified with header background color (`var(--header)`) — no black band
- **Border-radius hierarchy**: inputs `rounded-md` → buttons `rounded-lg` → cards `rounded-xl`
- **Card dropdown fix**: tracked `menuOpen` state, opacity fade overlay, `modal={false}` on Radix DropdownMenu
- **HLS iOS Safari fix**: transcoded streams play beyond 6-7s
- **LAN access fix**: removed hardcoded `AUTH_URL=localhost`

### Key Files Modified
- `src/app/globals.css` — glass utilities, animations (fadeInUp, fadeIn, irisOpen, stagger-children)
- `src/app/(main)/movies/page.tsx` — glass pill sort/filter buttons, glass dropdown menus
- `src/app/(main)/movies/[id]/page.tsx` — backdrop-blur detail panel
- `src/app/(main)/people/[id]/page.tsx` — same as movie detail
- `src/components/movie/movie-card.tsx` — menuOpen state tracking, opacity fade overlay
- `src/components/people/person-card.tsx` — same pattern as movie-card

## 2026-03-02: Bookmark Mode (Frame Scrubber)

Lightweight frame browser on the movie detail page for creating bookmarks without video playback. Solves the problem of VR videos being too heavy for real-time FFmpeg transcoding.

### New Files
- `src/app/api/movies/[id]/frame/route.ts` — Frame extraction API (`GET ?t=SECONDS&disc=N&maxWidth=W`), uses `ffmpeg -ss` for fast keyframe seek, 10s timeout, 960px default max width
- `src/components/movie/frame-scrubber.tsx` — Self-contained client component with progress bar (click/drag), frame preview, bookmark creation UI (icon selector, tags, note)

### Modified Files
- `src/app/(main)/movies/[id]/page.tsx` — Added BookmarkPlus button in action row, conditional FrameScrubber panel between hero and content sections
- `src/i18n/messages/en.json` / `zh.json` — Added bookmarkMode, scrubberLoading, scrubberDragHint, closeScrubber keys

### Key Behaviors
- Progress bar: click = instant frame fetch, drag = 300ms debounced fetch
- Frame display: `<img>` with browser caching for repeated URLs
- Bookmark markers: colored dots on progress bar matching existing player seek bar pattern
- Bookmark creation: fetches frame blob as thumbnail, POSTs FormData to existing bookmarks API
- Multi-disc support: disc tab selector, per-disc runtime and bookmarks
- Button hidden when movie has no runtimeSeconds

## 2026-03-01: Play Always Starts From Beginning
- Play button on movie detail page now passes `?t=0` to always start playback from beginning
- No resume button needed — users can use bookmarks to jump to specific positions

## 2026-03-01: Auth Redirect Fixes & Sort/Filter State Persistence

### Sign Out Redirect Fix
- `signOut()` in nav-sidebar now passes `{ callbackUrl: "/login" }` explicitly, preventing redirect to `0.0.0.0:3000`

### Login Redirect Fix
- Login form now sanitizes `callbackUrl` to pathname-only, stripping any absolute URL with `0.0.0.0` host that middleware may inject

### Sort/Filter State Persistence
- Movies page sort (field, order, dimension) and filter (genres, tags, years) state now synced to URL search params
- Active tab (movies/favorites/genres/actors) persisted in URL `tab` param
- Navigating to movie detail and back preserves all sort/filter/tab selections
- State initialized from URL params on mount; changes written back via `router.replace`

## 2026-03-01: UI Polish — Entrance Animations, Card Tiers, Typography

Visual refinement pass across all utility and content pages to match the cinematic quality of the main browsing experience.

### Global (globals.css)
- `stagger-children` CSS class: children fade-in with 50ms stagger delays
- `animate-fade-in-up` / `animate-slide-in-right` / `animate-slide-in-left` keyframe animations
- `brand-glow` pulsing text-shadow for Kubby logo
- Enhanced input focus states: blue glow ring + background shift (applies globally)
- `card-hover` class: translateY lift + border brighten on hover
- `button:active` scale-down feedback (0.98)

### Setup Wizard
- Slide left/right animations between steps based on navigation direction
- Progress dots replaced with numbered step indicators + check icons + connecting lines
- Brand glow on Kubby logo across all steps

### Auth Pages (Login, Register)
- Card fade-in-up animation on mount
- Brand glow on Kubby logo

### Dashboard
- Stat cards: elevated card surface (`bg-white/[0.03]` + shadow), `tabular-nums` for values
- Section headings: icon + gradient divider line pattern
- Activity rows: hover highlight
- Quick action buttons: subtle bg + hover lift
- All sub-pages (Users, Scraper, Networking, Libraries): `stagger-children` entrance, `text-3xl tracking-tight` titles, elevated card surfaces

### Admin Sidebar
- Rounded nav items with padding
- Active state: gradient background (`from-primary/12 to-transparent`) + rounded pill indicator
- Gradient divider below section label
- Smooth hover transition on items

### User Settings, Card Badges, Personal Metadata
- `stagger-children` entrance animations
- Elevated card surfaces with shadow
- Avatar glow ring on settings page
- `tracking-tight` on section headings

### Content Pages
- Home page: stagger-fade on ScrollRow sections
- Movie browse: fade-in-up on grid containers (first load only, not on infinite scroll)
- Genres tab: stagger-fade on genre rows
- Favorites tabs: fade-in-up on grids

### Detail Pages (Movie, Person)
- Hero content (poster + info overlay): fade-in-up
- Sections below hero (discs, bookmarks, cast, recommended, filmography, gallery): stagger-fade

### Modified Files
- `src/app/globals.css` — animation keyframes, input focus, card-hover, button feedback
- `src/app/(setup)/setup/setup-wizard.tsx` — step transitions, progress indicator
- `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/register/page.tsx` — entrance animation
- `src/app/(main)/dashboard/page.tsx` — stat cards, section headings, quick actions
- `src/app/(main)/dashboard/users/page.tsx`, `scraper/page.tsx`, `networking/page.tsx`, `libraries/page.tsx` — stagger + card tiers
- `src/app/(main)/settings/page.tsx` — avatar glow, card tiers
- `src/app/(main)/card-badges/page.tsx`, `personal-metadata/page.tsx` — stagger + card tiers
- `src/app/(main)/page.tsx` — home row stagger, favorites fade-in
- `src/app/(main)/movies/page.tsx` — grid fade-in, genres stagger
- `src/app/(main)/movies/[id]/page.tsx` — hero fade-in, sections stagger
- `src/app/(main)/people/[id]/page.tsx` — hero fade-in, sections stagger
- `src/components/layout/admin-sidebar.tsx` — redesigned nav items

---

## 2026-03-01: Hardware-Accelerated Transcoding + HLS Improvements

End-to-end overhaul of the streaming pipeline: hardware encoder auto-detection, resolution selection, HLS-aware seeking, and session lifecycle hardening.

- **hw-accel.ts**: auto-detect VideoToolbox (macOS) / NVENC (NVIDIA) / libx264 (CPU) with runtime fallback if HW encoder fails
- **Player HW/SW badge**: green "HW" / dim "SW" indicator with encoder detail popover
- **Resolution selector**: 原画 (original) / 1080p / 720p / 480p with smart filtering by source width; 1080p cap for transcoding
- **Decide API**: returns `videoWidth` and `durationSeconds`; `maxWidth` param flows through decide → FFmpeg pipeline (maxWidth=0 skips scale)
- **HLS-aware seeking**: `seekTo`, `hlsTimeOffsetRef`, `getRealTime`, destroy+recreate HLS instance on seek; 500ms debounce + AbortController on client seeks
- **Backend duration for progress bar**: fixes HLS.js reporting only 6-8s of duration
- **PATCH heartbeat** on `/api/stream/[sessionId]` (30s keepalive)
- **Session lifecycle tuning**: idle timeout 10min→90s, cleanup interval 60s→15s, SIGKILL fallback 2s after SIGTERM
- **Encoding performance**: ultrafast preset + threads 0 for faster SW encoding
- **Bug fixes**: seek race condition (stopLoad before seek, play after loadSource, skip error recovery during seek); progress bar jump and video freeze during seek (hlsSeekingRef flag); stale globalThis singleton after dev hot-reload (version key)

---

## 2026-03-01: Movie Browser Sort Options

- Added file size sorting option to movies API and browser UI
- Added resolution sorting option to movies API and browser UI

---

## 2026-03-01: Empty Home Page Library Card

- New `AddLibraryCard` component: dashed-border card in Media Libraries scroll row when no libraries exist
- Clicking the card opens the Add Library dialog inline

---

## 2026-03-01: Back/Home Navigation Buttons

- Added back and home buttons to the app header on 6 pages for improved navigation

---

## 2026-03-01: Non-Admin Dashboard Protection

- Hide Administration section from non-admin users in the nav sidebar
- Redirect non-admin `/dashboard` access to `/` instead of `/login`

---

## 2026-03-01: Complete Admin User Management System

Full CRUD user management for administrators with role management and security protections.

### New Files
- `src/app/api/users/[id]/route.ts` — DELETE (admin delete user) and PUT (admin update role/reset password) endpoints

### Modified Files
- `src/app/api/users/route.ts` — Added admin auth check to GET, restricted POST to admin-only after first user, accept `isAdmin` field from admin callers
- `src/app/(main)/dashboard/users/page.tsx` — Full rewrite from read-only list to management page with Add User, Delete, Role Toggle, and Reset Password dialogs
- `src/i18n/messages/en.json` — Added 18 dashboard user management translation keys
- `src/i18n/messages/zh.json` — Added corresponding Chinese translations

### Key Features
- **Admin create user**: Dialog with username, password, display name, admin toggle
- **Delete user**: Confirmation dialog with cascade warning (ratings, bookmarks, watch history)
- **Toggle admin role**: Click role badge to promote/demote users
- **Reset password**: Admin can set new password for any user
- **Last-admin protection**: Cannot demote or delete the sole administrator
- **Self-delete prevention**: Admin cannot delete their own account
- **Closed registration**: Public registration locked after first user; only admins can create users
- **API authorization**: GET /api/users and POST /api/users require admin auth (except first-user setup)

---

## 2026-03-01: Hardware-Accelerated Transcoding (VideoToolbox + NVENC + Fallback)

Auto-detects and uses the best available hardware encoder for HLS transcoding with zero configuration.

### Encoder Priority
- **h264_videotoolbox** (macOS Apple Silicon) — 3-10x faster than CPU
- **h264_nvenc** (NVIDIA GPU with CUDA) — GPU-accelerated encoding
- **libx264** (CPU fallback) — unchanged behavior for systems without hardware encoders

### New Files
- `src/lib/transcode/hw-accel.ts` — encoder detection (`ffmpeg -encoders` + `-hwaccels` parsing), encoder config types, libx264 fallback config

### Modified Files
- `src/lib/transcode/ffmpeg-command.ts` — accepts `EncoderConfig`, branches on encoder for `-hwaccel`, `-c:v`, quality args; only adds `-threads 0` for libx264
- `src/lib/transcode/transcode-manager.ts` — lazy encoder detection cached in singleton, runtime fallback (hardware fail → retry with libx264, `retriedWithSoftware` flag prevents loops)
- `src/app/api/movies/[id]/stream/decide/route.ts` — returns `encoder` field in HLS response
- `src/app/(main)/movies/[id]/play/page.tsx` — green "HW" / dim "SW" badge next to time display (hover shows encoder name), only visible during remux/transcode

### Key Design Decisions
- Detection runs once on first transcode, cached for process lifetime
- Runtime fallback: if hardware encoder FFmpeg exits non-zero, transparently restarts with libx264 (same session ID, no client disruption)
- All encoders use CPU `scale` filter for 1080p downscale (hardware scale filters add complexity without meaningful gain at this resolution)

---

## 2026-02-28: HLS Transcoding for Universal Video Playback

FFmpeg converts incompatible video formats to HLS on-demand. Browser-compatible formats keep direct play.

### Decision Logic
- **Direct play**: MP4+H.264+AAC, WebM+VP8/VP9+Opus/Vorbis
- **Remux** (copy streams to HLS): browser-compatible codec but wrong container (MKV/MOV/TS with H.264)
- **Transcode** (re-encode to H.264+AAC): incompatible codecs (mpeg4, wmv2, flv1, etc.)

### New Files
- `src/lib/transcode/playback-decider.ts` — pure function deciding direct/remux/transcode
- `src/lib/transcode/ffmpeg-command.ts` — builds FFmpeg HLS command arguments
- `src/lib/transcode/transcode-manager.ts` — singleton managing FFmpeg child processes (session lifecycle, idle cleanup, graceful shutdown via globalThis pattern)
- `src/app/api/movies/[id]/stream/decide/route.ts` — decide endpoint
- `src/app/api/stream/[sessionId]/playlist.m3u8/route.ts` — HLS playlist serving
- `src/app/api/stream/[sessionId]/segment/[name]/route.ts` — HLS segment serving
- `src/app/api/stream/[sessionId]/route.ts` — session management (seek/stop)

### Modified Files
- `src/lib/paths.ts` — added getFfmpegPath(), getTranscodeCacheDir()
- `src/lib/scanner/index.ts` — added .ts to VIDEO_EXTENSIONS
- `src/app/api/movies/[id]/stream/route.ts` — added .flv and .ts MIME types
- `src/app/(main)/movies/[id]/play/page.tsx` — HLS.js integration with decide-then-play pattern
- `launcher/server.go` — added resolveFfmpegBin() and FFMPEG_PATH env var
- `scripts/package.ts` — added ffmpeg binary download for all platforms

### New Dependency
- `hls.js` — HLS playback in browsers

### Key Design Decisions
- Transcode temp files in `os.tmpdir()/kubby-transcode/` (ephemeral, OS clears on reboot)
- 10-minute idle session cleanup, graceful shutdown kills all FFmpeg processes
- FFmpeg unavailable → graceful fallback to direct play with warning
- HLS.js handles playback; Safari uses native HLS via `video.src`
- Session cleanup on unmount + beforeunload for reliable cleanup

---

## 2026-02-12: 5 Jellyfin-Inspired UI Features

### F1: Movie Card Hover Play Button
- Centered Play circle icon appears on poster hover (z-index between poster and bottom overlay)
- Hovering the play icon scales it up (1.25×) and changes background to primary color
- Clicking the play button navigates directly to `/movies/${id}/play` (bypasses detail page)
- Uses `e.preventDefault()` + `e.stopPropagation()` to prevent Link navigation

### F2: ScrollRow Inline Arrows on Home Page
- Home page MovieRow and Media Libraries sections now pass `title` prop to `<ScrollRow>`
- This activates the inline left/right arrow mode (title row with nav buttons) instead of floating overlay arrows
- Removed external `<h2>` wrappers, letting ScrollRow handle the title

### F3: Library Card Redesign
- Library card now shows a fanart cover image (320×180) fetched from a random movie in the library
- Falls back to Film/Folder icon if no cover image available
- Text (name + movie count) displayed below card, centered
- Dropdown menu updated: Scan Library, Refresh Metadata, Edit Metadata, Edit Image, Delete
- API: Added `coverImage` subquery to `GET /api/libraries` response
- i18n: Added `editMetadata`, `editImage` to home namespace (EN/ZH)

### F4: Hamburger Sidebar Navigation
- New `NavSidebar` component: slide-out drawer from the left
- Backdrop with blur, closes on click or ESC key
- Sections: Home, Media (Movies), Administration (Dashboard, Metadata Manager), User (Settings, Sign Out)
- Active state highlighting with `bg-primary/10 text-primary`
- Hamburger `<Menu>` icon button added at far left of header
- i18n: Added `media`, `administration`, `metadataManager`, `user` to nav namespace (EN/ZH)

### F5: Centered Sort & Filter Toolbar
- New `GET /api/libraries/[id]/filters` endpoint returns `{ genres, years }` for a library
- Movies API: Added `sortOrder` (asc/desc), `genres` (comma-separated, OR logic), `years` (comma-separated) params
- Movies page toolbar: two centered icon buttons (Sort By + Filter)
- Sort dropdown: field radio options + ascending/descending radio
- Filter dropdown: collapsible Genres and Years sections with checkboxes, active filter count badge, "Clear All" button
- i18n: Added `sortOrder`, `ascending`, `descending`, `filter`, `clearFilters` to movies namespace (EN/ZH)

## 2026-02-12: Hover Action Menus for Library Cards & Movie Cards

### Library Card hover menu
- Hover → ⋯ button (bottom-right) → Dropdown with: Scan Library, Refresh Metadata, Edit, Delete
- Scan Library triggers `POST /api/libraries/${id}/scan` and invalidates queries
- Delete shows confirmation dialog, then calls `DELETE /api/libraries/${id}`
- Refresh Metadata / Edit are placeholder alerts

### Movie Card hover actions
- Hover → bottom overlay bar with: ✓ Watched toggle (left), ❤️ Favorite toggle (right), ⋯ Dropdown (right)
- Dropdown items: Play, Edit Metadata, Media Info, Refresh Metadata, Delete
- Play navigates to `/movies/${id}/play`
- Delete shows confirmation dialog, then calls `DELETE /api/movies/${id}`
- Edit Metadata / Media Info / Refresh Metadata are placeholder alerts
- Added `DELETE /api/movies/[id]` API endpoint with auth check

### Additional polish
- Frosted glass (backdrop-blur) dropdown background
- Person card name/role moved below poster (Jellyfin style)
- Card text labels centered
- Card border-radius set to 4px
- Removed static favorite heart badge from movie card poster
- Header height reduced (h-16 → h-12)
- Transparent header on person detail page
- EN/ZH i18n strings for all action labels

## 2026-02-14: TMDB Scraper for Automatic Movie Metadata

### Core scraper infrastructure
- New `settings` table (key-value) for centralized configuration (e.g. TMDB API key)
- New `scraper_enabled` column on `media_libraries` table
- Drizzle migration: `drizzle/0002_familiar_scarecrow.sql`

### TMDB client expansion (`src/lib/tmdb.ts`)
- `searchMovie(query, year, apiKey)` - search TMDB for movies
- `getMovieDetails(tmdbId, apiKey)` - full details with credits in one call
- `downloadTmdbImage(tmdbPath, destPath, size)` - download poster/backdrop/profile images
- `validateApiKey(apiKey)` - test TMDB API key validity
- Image size constants: `TMDB_POSTER_SIZE` (w500), `TMDB_BACKDROP_SIZE` (w1280), `TMDB_PROFILE_SIZE` (w185)

### NFO generator (`src/lib/scanner/nfo-writer.ts`)
- `writeFullNfo(nfoPath, data)` - generates complete Kodi/Jellyfin-compatible `movie.nfo`
- Supports: title, originalTitle, plot, tagline, rating, runtime, premiered, year, genres, studios, country, uniqueid (tmdb/imdb), actors (with thumb), directors

### Scraper module (`src/lib/scraper/`)
- `folder-parser.ts` - parses "Inception (2010)" into `{ title, year }`
- `index.ts` - `scrapeMovie()` orchestrates: search → details → download images → generate NFO
- Downloads poster.jpg, fanart.jpg to movie dir; actor photos to `data/metadata/people/{Letter}/{Name}/`
- 250ms rate limiting between TMDB API calls

### Scanner integration (`src/lib/scanner/index.ts`)
- Scraper runs as pre-processing step: if no `movie.nfo` and scraper enabled, scrape from TMDB first
- Then existing NFO parse + DB import flow handles everything unchanged
- Falls back gracefully on scrape failure (log warning, skip)

### Dashboard scraper settings page (`/dashboard/scraper`)
- API key input with show/hide toggle
- Save validates key against TMDB API before storing
- Status indicators: configured (green check), saved, invalid (red X)
- Help text with link to get TMDB API key

### Library creation UI update (`/dashboard/libraries`)
- "Enable metadata scraper" checkbox in Add Library dialog
- Warning hint when scraper enabled but no TMDB API key configured, with link to settings

### Admin sidebar
- Added "Scraper" nav item with Search icon

### i18n (EN + ZH)
- 10 new keys in `dashboard` namespace: scraperSettings, metadataProviders, tmdbApiKey, tmdbApiKeyHelp, apiKeySaved, apiKeyInvalid, enableScraper, scraperApiKeyMissing, configureApiKey, scraping

## 2026-02-18: Metadata Editing (Movie + Person)

### Movie metadata editor
- Three-dot (⋮) menu on movie detail page with: Edit Metadata, Edit Images, Edit Subtitles, Identify, Media Info, Refresh Metadata, Delete Media (non-edit items are placeholders)
- `MovieMetadataEditor` dialog component with two tabs: General and External IDs
- General tab: Title, Original Title, Sort Title, Overview (textarea), Tagline, Year, Premiere Date, Runtime, Community Rating, Official Rating, Country, Genres (tag input with Enter-to-add), Studios (tag input)
- External IDs tab: TMDB ID, IMDB ID
- `PUT /api/movies/[id]` endpoint: updates DB fields, regenerates NFO file via `writeFullNfo()`
- NFO writer updated to support `sortTitle` field
- Movie card "Edit Metadata" dropdown item now opens the editor dialog instead of placeholder alert

### Person metadata editor
- Three-dot (⋮) menu on person detail page with: Edit Metadata
- `PersonMetadataEditor` dialog component with two tabs: General and External IDs
- General tab: Name, Type (select: actor/director/writer/producer), Biography (textarea), Birth Date, Birth Year, Place of Birth, Death Date
- External IDs tab: TMDB ID, IMDB ID
- `PUT /api/people/[id]` endpoint: updates person record in DB
- Extended `people` table schema with new columns: overview, birth_date, birth_year, place_of_birth, death_date, imdb_id, date_added
- Drizzle migration: `drizzle/0003_metadata_editing.sql`

### UI components
- New `Textarea` component (`src/components/ui/textarea.tsx`) matching shadcn/Input styling

### i18n (EN + ZH)
- New `metadata` namespace with 34 keys: editMetadata, general, externalIds, title, originalTitle, sortTitle, overview, tagline, year, premiereDate, runtime, runtimeMinutes, communityRating, officialRating, country, genres, studios, addGenrePlaceholder, addStudioPlaceholder, name, type, actor, director, writer, producer, biography, birthDate, birthYear, placeOfBirth, deathDate, saving, editImages, editSubtitles, identify, deleteMedia

## 2026-02-19: Personal Metadata Settings & Multi-Dimensional Ratings

### Database schema changes
- New `user_preferences` table: userId (unique), movieRatingDimensions (JSON), personRatingDimensions (JSON), showMovieRatingBadge (bool), showPersonTierBadge (bool)
- New `dimension_ratings` (JSON text) column on both `user_movie_data` and `user_person_data` tables
- Stores per-dimension scores (e.g. `{"剧情": 9.5, "特效": 8.0}`)

### Preferences API (`/api/settings/personal-metadata`)
- GET: Returns user preferences (dimensions arrays, badge toggles) with defaults
- PUT: Upserts preferences with validation (max 10 dimensions per type)

### Client-side hook (`src/hooks/use-user-preferences.ts`)
- `useUserPreferences()` hook with React Query caching (5 min staleTime)
- Shared across all card/rating components via query key deduplication

### Personal Metadata settings page (`/personal-metadata`)
- Movie Rating Dimensions section: tag-input (chips + Enter-to-add), max 10
- Person Rating Dimensions section: same tag-input pattern, max 10
- Card Badge Settings section: two toggle switches for movie rating badge and person tier badge
- Save button persists all settings, invalidates cached preferences

### Multi-dimensional star rating dialog
- When dimensions configured: shows vertically stacked dimension rows, each with 5 smaller stars (h-6 w-6) + fine-tune buttons + numeric display
- Computed "Overall" average displayed as read-only below dimension rows
- When no dimensions: existing single-rating behavior unchanged
- Dialog width adapts: 480px for dimensions mode, 340px for single mode

### Metadata editors updated
- Movie metadata editor: Personal tab shows per-dimension number inputs when movieRatingDimensions configured
- Person metadata editor: Personal tab shows per-dimension star rows when personRatingDimensions configured
- Both compute personalRating as average of dimension values on save

### Card badge visibility
- MovieCard: respects `showMovieRatingBadge` preference (when false, falls through to community rating)
- PersonCard: respects `showPersonTierBadge` preference (when false, hides tier badge)
- PersonCard converted to client component with `"use client"` directive

### Detail pages updated
- Movie detail page: passes dimensions and dimensionRatings to StarRatingDialog
- Person detail page: passes dimensions and dimensionRatings to StarRatingDialog
- Both savePersonalRating functions send dimensionRatings alongside personalRating

### User-data APIs updated
- Movie and person user-data GET: parse and return dimensionRatings from JSON
- Movie and person user-data PUT: accept and store dimensionRatings
- Movie and person detail GET: include dimensionRatings in userData response

### Sidebar navigation
- Added "Personal Metadata" link (SlidersHorizontal icon) under Media section

### i18n (EN + ZH)
- New `nav.personalMetadata` key
- New `personalMetadata` namespace with 14 keys: title, movieRatingDimensions, movieRatingDimensionsDesc, personRatingDimensions, personRatingDimensionsDesc, addDimensionPlaceholder, cardBadgeSettings, showMovieRatingBadge, showMovieRatingBadgeDesc, showPersonTierBadge, showPersonTierBadgeDesc, saved, failedToSave, maxDimensions, overall

## 2026-02-19: Cast Editing & Actor Age at Release

### Cast editing in movie metadata editor
- New "Cast" tab in `MovieMetadataEditor` dialog between General and Personal tabs
- Each cast entry row: Name (text input), Type (select: actor/director/writer/producer), Role (text input), X remove button
- "Add Person" button with dashed border at bottom of list
- `PUT /api/movies/[id]` updated: when `cast` array provided, deletes existing `moviePeople` rows and re-inserts with proper sort order
- Person lookup: finds existing person by name+type, creates new record if not found
- `GET /api/movies/[id]` now returns `allPeople` array (all people for the movie, not filtered by type) for the editor

### Actor age at film release on person cards
- `GET /api/movies/[id]` cast query now includes `birthDate` from people table
- `PersonCard` component: new optional `age` prop displayed as third line below role
- `computeAgeAtRelease()` helper on movie detail page: calculates age from birthDate and premiereDate (or year as fallback with July 1 midpoint)
- Age hidden when birthDate or release date is missing

### i18n (EN + ZH)
- New `metadata` keys: cast (演职人员), role (角色), addCast (添加人员)

## 2026-02-19: Overview Truncation & Clickable Tags/Genres/Studios

### Overview truncation on movie detail page
- Added `line-clamp-4` to overview paragraph to limit to 4 lines with "..." overflow
- Prevents long overviews from misaligning the poster layout

### Clickable tags, genres, and studios
- Tags, genres, and studios on movie detail page are now `<Link>` components
- Clicking navigates to `/movies?libraryId=X&genre=Y` (or `&tag=` / `&studio=`)
- Hover effect: underline + brighter text color
- Added `mediaLibraryId` to `MovieDetail` interface (already returned by API)

### Filter params support on movies page
- Movies page reads `genre`, `tag`, `studio` from URL search params
- `genre` param pre-selects that genre in the filter state
- `tag` and `studio` params passed directly to the API query
- Query key includes URL filter params for proper cache invalidation

### API tag/studio filtering
- `GET /api/movies` now supports `tag` and `studio` query params
- Uses `like(movies.tags, ...)` and `like(movies.studios, ...)` matching (same pattern as existing `genre` filter)

### Header filter label
- When on `/movies` with `genre`, `tag`, or `studio` param, the header title shows "Library Name — FilterValue"

## 2026-02-20: Card Badge Settings — Preview Cards & Expandable Rule Descriptions

### Badge preview cards
- Movie Card Preview: abstract poster placeholders (gradient + film icon) at 120×180, showing "Enabled" (with active badges) and "Disabled" (no badges) side by side
- Person Card Preview: abstract poster placeholders (gradient + user icon) showing "Enabled" (with tier "S" badge) and "Disabled" side by side
- Previews react to toggle state: toggling resolution/rating/tier off removes that specific badge from the "Enabled" preview in real-time

### Expandable rule descriptions
- Resolution badge rules: clickable "View rules" chevron expands to show all width→label thresholds (8K through SD) in a two-column grid
- Tier badge rules: clickable "View rules" chevron expands to show all rating→tier thresholds (SSS through E) with each tier label styled in its actual color from `getTierColor()`

### i18n (EN + ZH)
- New `cardBadges` keys: badgeEnabled, badgeDisabled, viewRules, hideRules, resolutionRulesTitle, tierRulesTitle

## 2026-02-20: Library Scan Progress Display

### SSE streaming progress from scanner
- `scanLibrary()` now accepts optional `onProgress` callback with `{ current, total, title }` signature
- Progress is throttled to ~20 events max (every 5% boundary) regardless of library size, plus first and last item
- Directories are pre-counted for accurate total before scanning begins

### API converted to Server-Sent Events
- `POST /api/libraries/[id]/scan` now returns `text/event-stream` response
- Streams `data: {"current":N,"total":M}` events during scan
- Sends `data: {"done":true,"scannedCount":N}` on completion
- Sends `data: {"error":"..."}` on failure

### LibraryCard progress bar UI
- Scanning overlay now shows a `<Progress>` bar with "Scanning 5/120" text
- Falls back to "Scanning..." text before first progress event arrives
- SSE fetch + stream parsing handled directly in the component
- Prop changed from `onScan` to `onScanComplete` (just for query invalidation)

### Dashboard libraries page progress
- "Scan Now" button shows inline progress text "5/120" during scan
- Button disables across all libraries while a scan is in progress

### i18n (EN + ZH)
- New `home.scanProgress` key: "Scanning {current}/{total}" / "扫描中 {current}/{total}"

## 2026-02-21: Multi-Folder Support per Library + Checkbox Bug Fix

### Multi-folder support
- New `src/lib/folder-paths.ts`: `parseFolderPaths()` and `serializeFolderPaths()` helpers for backward-compatible JSON array storage in existing `folderPath` column (no DB migration needed)
- Scanner (`src/lib/scanner/index.ts`): iterates all folder paths, aggregates movie directories across all paths, skips missing paths with warning instead of failing
- `GET /api/libraries`: returns `folderPaths: string[]` alongside `folderPath`, poster.jpg lookup uses first path
- `POST /api/libraries`: accepts `folderPaths: string[]` (falls back to single `folderPath` for backward compat)
- `GET /api/libraries/[id]`: returns `folderPaths` array
- `PUT /api/libraries/[id]`: accepts `folderPaths: string[]`
- `POST/DELETE /api/libraries/[id]/cover`: uses first path for poster.jpg location
- `POST /api/setup/complete`: wraps single `folderPath` in `serializeFolderPaths([folderPath])`

### Multi-path edit UI
- LibraryCard edit dialog: shows list of existing paths with remove button (disabled when only 1 path), text input + "Add Folder" button to add new paths, Enter key support
- Dashboard "Add Library" dialog: same multi-path UI with folder picker integration
- Dashboard library cards: display all paths (one per line, monospace)
- Home page: passes `folderPaths` array to `LibraryCard` component

### Checkbox bug fix
- Removed `e.preventDefault()` from edit dialog's `DialogContent` onClick handler
- Dialog renders via Radix portal (outside `<Link>`), so `preventDefault` was unnecessary and actively blocked native checkbox toggle behavior

### i18n (EN + ZH)
- New `home.folderPaths`: "Folder Paths" / "文件夹路径"
- New `home.addFolder`: "Add Folder" / "添加文件夹"
- New `home.removeFolder`: "Remove Folder" / "移除文件夹"

## 2026-02-21: Actor List Page with Sort, Filter, Tags & Personal Rating

### New "Actors" tab on library browse page
- Fourth tab alongside Movies, Favorites, Genres on the `/movies?libraryId=` page
- Displays all people linked to movies in the current library as poster cards
- PersonCard rendered at movie-card size (180×270) with tier badges
- Click poster → navigates to person detail page

### Sort options
- Name (A–Z), Personal Rating, Date Added, Movie Count
- Ascending/descending toggle (defaults: asc for name, desc for others)

### Filter options
- Type: checkboxes for actor/director/writer/producer (populated from library data)
- Tags: checkboxes from people's tags in the library
- Tier: checkboxes for SSS through E + Unrated

### People tags support
- New `tags` column on `people` table (JSON array string, same pattern as movies)
- DB migration: `drizzle/0005_people_tags.sql` + auto-migration in `src/lib/db/index.ts`
- Person metadata editor: tag chips with X remove + text input with Enter-to-add in General tab
- `GET /api/people/[id]`: returns parsed `tags` array
- `PUT /api/people/[id]`: accepts `tags` array, stores as JSON

### New APIs
- `GET /api/people`: list people with filters (libraryId, search, sort, sortOrder, types, tags, tier, limit)
  - JOINs moviePeople → movies for library scoping, LEFT JOINs userPersonData for personal rating
  - Computes movieCount via COUNT(DISTINCT movie_id)
  - Tier filter applied in application code using getTier() thresholds
- `GET /api/libraries/[id]/people-filters`: returns available types and tags for people in the library

### PersonCard update
- New `"movie"` size option: 180×270 (matches MovieCard poster dimensions)

### i18n (EN + ZH)
- New `movies` keys: actors, noActors, actorsCount, nameAZ, movieCount, personalRating, type, allTypes, unrated, tier

## 2026-02-21: Person Photo Gallery Wall

### Gallery API (`/api/people/[id]/gallery`)
- `GET`: Lists gallery images from `{personDir}/gallery/` directory, filtered to image extensions (jpg, jpeg, png, webp), sorted by filename
- `POST`: Multi-file upload via FormData, auto-numbers files as `001.jpg`, `002.png` etc., creates `gallery/` subdirectory if needed
- `DELETE`: Removes a single gallery image by filename, validates against path traversal attacks
- Person directory derived from `photoPath` in DB or computed from person name using `sanitizePersonName()`

### Gallery section on person detail page (`/people/[id]`)
- "Photos" section below Filmography with count display and Upload button (ImagePlus icon)
- CSS grid layout with `repeat(auto-fill, 220px)` columns, 3:4 aspect ratio thumbnails with `object-cover`
- Hover effect: subtle scale-up + delete X button appears (top-right corner)
- Hidden file input triggered by Upload button, supports multiple file selection
- Refetches gallery query on successful upload or delete

### Lightbox viewer
- Full-screen fixed overlay with dark backdrop (`bg-black/90`)
- Centered image with `object-contain`, max 90vw × 90vh
- Left/right arrow buttons for navigation between images
- Keyboard support: Escape to close, arrow keys to navigate
- Click backdrop to close, click image to stay open

### i18n (EN + ZH)
- New `person` keys: photos (照片), photosCount (张照片), uploadPhotos (上传), deletePhoto (删除照片), noPhotos (暂无照片)

## 2026-02-21: Multi-Dimension Rating Sort

### Backend: People API dimension sort
- `GET /api/people`: new `sortDimension` query param
- When `sort=personalRating` + `sortDimension` provided: sorts by `json_extract(upd.dimension_ratings, '$."dimensionName"')` with COALESCE fallback to -1
- When `sort=personalRating` without `sortDimension`: existing behavior (sorts by `upd.personal_rating`)

### Backend: Movies API dimension sort
- `GET /api/movies`: new `sortDimension` query param
- When `sort=personalRating` + `sortDimension` provided: sorts by `json_extract(userMovieData.dimensionRatings, '$."dimensionName"')` via raw SQL order clause
- When `sort=personalRating` without `sortDimension`: existing behavior

### Frontend: Expandable sort dropdown
- All three sort dropdowns (`MoviesTabContent`, `PersonMoviesContent`, `ActorsTabContent`) updated:
  - If user has configured rating dimensions: "Personal Rating" sort option becomes expandable with chevron toggle
  - Expanding reveals: "Overall" (sorts by average personal_rating) + each dimension name as individual sort sub-items
  - If no dimensions configured: "Personal Rating" remains a flat, non-expandable sort item
  - Clicking a dimension sub-item sets `sort=personalRating` + `sortDimension=dimensionName` + auto-sets descending order
  - Active state highlighting on the specific selected sub-item
- `sortDimension` state included in React Query keys for automatic refetch on change
- Uses `useUserPreferences()` hook: `movieRatingDimensions` for movie tabs, `personRatingDimensions` for actors tab

### i18n (EN + ZH)
- New `movies.overall` key: "Overall" / "综合"

## 2026-02-22: Person Detail Fanart View, Person Card Edit Metadata, Tags UI Fix

### Person detail fanart view button
- Added `Maximize2` button in the person detail header badges area (matches movie detail behavior)
- When clicked, gradients and content overlay fade out (`opacity-0 pointer-events-none` with 300ms transition) to reveal full fanart background
- Click-to-dismiss overlay (`z-20 cursor-pointer`) restores normal view
- Button only appears when `fanartPath` exists on the person

### Person card "Edit Metadata" in dropdown
- Added `Pencil` icon + "Edit Metadata" option to the three-dot dropdown menu on `PersonCard`
- Opens `PersonMetadataEditor` dialog (same component used on person detail page)
- Dialog rendered outside `<Link>` to prevent navigation on portal event bubbling

### Person metadata editor tags UI consistency
- Changed tags from inline chips-inside-bordered-container to movie editor style: chip list above + separate `<Input>` component below
- Chips now use `bg-primary/10 text-primary` styling instead of `bg-white/10 text-foreground`
- Remove button uses `<X>` lucide icon instead of plain `×` character
- Imported `X` from lucide-react and `Input` component (already imported) for consistency

## 2026-02-22: Auto-Detect Video-Named NFO Files

### Scanner enhancement
- Before checking for `movie.nfo`, scanner now looks for an NFO file matching the video file name (e.g., `Inception.mp4` → `Inception.nfo`)
- If found, copies it to `movie.nfo` (preserving the original) so existing NFO parse flow works unchanged
- Only triggers when `movie.nfo` does not already exist
- Non-matching NFO names (video name ≠ NFO name) fall through to scraper or skip logic as before
- Enables importing media libraries from other tools (Jellyfin, Kodi, etc.) that use video-named NFO conventions

## 2026-02-22: Multi-Disc/Multi-CD Movie Support

### Database schema
- New `movie_discs` table: per-disc metadata (file_path, label, poster_path, runtime_seconds, video_codec, audio_codec, video_width, video_height, audio_channels, container, total_bitrate, format_name)
- New `movies.disc_count` column (integer, default 1)
- New `media_streams.disc_number` column (integer, default 1)
- New `user_movie_data.current_disc` column (integer, default 1) for multi-disc resume
- All defaults ensure existing single-disc movies work unchanged

### Scanner multi-disc detection
- Regex-based detection: `/[\s._\-\[\(]*(cd|dvd|disc|disk|part|pt)[\s._\-]*(\d+|[a-d])/i`
- Requires 2+ matching video files to be detected as multi-disc (prevents false positives)
- Per-disc poster lookup: `poster-disc{N}`, `poster-cd{N}`, `{videoBaseName}-poster`
- Primary disc probed first, then each additional disc probed and stored in `movie_discs`
- Total runtime calculated as sum of all disc runtimes
- Per-disc media streams stored with `disc_number` column

### API changes
- `GET /api/movies/[id]`: returns `discs[]` array with resolved poster paths and `currentDisc` in userData
- `GET /api/movies/[id]/stream`: supports `?disc=N` query parameter for per-disc streaming
- `PUT /api/movies/[id]/user-data`: accepts `currentDisc` field for resume tracking
- `GET /api/movies/[id]/media-info`: includes per-disc details (file, codec, resolution, runtime)

### Movie detail page disc section
- "Discs (N)" section between hero and cast for multi-disc movies
- Each disc card: poster (150x225, falls back to movie poster), label, runtime, resolution + codec badges
- Entire disc card is a link to play that specific disc
- Hero play button shows "Play All" for multi-disc movies

### Player multi-disc playback
- Reads `?disc=N` URL param or resumes from saved `currentDisc` in userData
- Auto-advances to next disc on `onEnded` event
- Shows disc label in top bar (e.g. "Movie Title — CD 2") with disc counter (2/3)
- Saves `currentDisc` alongside `playbackPositionSeconds` for resume
- On final disc ended: marks movie as played, resets `currentDisc` to 1

### i18n (EN + ZH)
- New `movies` keys: discs (分碟), disc (碟), playAll (播放全部)

## 2026-02-22: Packaging & Distribution System

### Next.js Standalone Adaptation
- Enabled `output: "standalone"` in `next.config.ts` for self-contained server bundle
- Added `sharp` to `serverExternalPackages` for proper native module bundling
- Created `src/lib/paths.ts` — centralized path management with `KUBBY_DATA_DIR` env var support
- Replaced hardcoded `process.cwd()/data` paths in 4 files: `db/index.ts`, `scanner/index.ts`, `person-utils.ts`, `scripts/enrich-nfo.ts`
- Added `FFPROBE_PATH` env var support in `scanner/probe.ts`
- Verified standalone build: `node .next/standalone/.../server.js` starts in ~95ms, all routes functional

### Go Launcher (`launcher/`)
- System tray application using `getlantern/systray`
- Manages Node.js child process lifecycle (start/stop/health check)
- OS-standard data directories: `~/Library/Application Support/Kubby` (macOS), `%LOCALAPPDATA%\Kubby` (Windows), `~/.local/share/kubby` (Linux)
- Auto-generates `AUTH_SECRET` on first run, persisted in data directory
- Config file (`config.json`) for port settings
- Tray menu: Open Kubby, Port display, Quit
- Graceful shutdown: SIGTERM → 5s wait → SIGKILL
- Cross-platform compilation via Makefile (darwin-arm64, darwin-x64, win-x64, linux-x64)
- Binary size: ~9MB

### Packaging Script (`scripts/package.ts`)
- Assembles distributable package: Go launcher + Node.js runtime + ffprobe + Next.js standalone
- Downloads Node.js 22 LTS binary from nodejs.org
- Downloads ffprobe static build (falls back to system ffprobe)
- Selective copy of standalone output (only server.js, package.json, node_modules, .next, public)
- Supports `--platform`, `--skip-download` flags
- Output to `dist/kubby-{platform}/` (~185MB total for darwin-arm64)

### GitHub Actions CI (`.github/workflows/release.yml`)
- Triggered on `v*` tag push
- Matrix builds: macOS arm64/x64, Windows x64, Linux x64
- Creates tar.gz (Unix) / zip (Windows) archives
- Publishes as draft GitHub Release with auto-generated notes

## 2026-02-24: 9 Bug Fixes & UI Improvements

### Windows folder picker: show all drives
- Filesystem API (`/api/filesystem`) now enumerates Windows drive letters via `wmic logicaldisk` (fallback: probe A-Z)
- When no path is specified on Windows, returns drive list (`isDriveList: true`) instead of defaulting to C:\Users\...
- At drive root (e.g. `C:\`), parent navigates back to drive list
- Folder picker UI shows HardDrive icon when viewing drives, disables "Select This Folder" on drive list

### Setup wizard: multi-folder + Jellyfin compatibility mode
- Setup wizard step 3 upgraded from single folder input to multi-folder support (same UI pattern as dashboard library creation)
- Each added path shown with X remove button, text input with Enter key support + folder picker + Add button
- Added Jellyfin Compatibility Mode toggle with description
- Auto-includes pending text input path on submit (prevents paste-and-submit empty path bug)
- Setup/complete API updated to accept `folderPaths[]` array and `jellyfinCompat` boolean (backward compatible with single `folderPath`)
- i18n: Added `jellyfinCompatMode` and `jellyfinCompatDesc` keys (EN + ZH)

### Scan progress after setup
- Homepage auto-detects libraries with `lastScannedAt=null` and `movieCount=0`, triggers SSE scan automatically
- Scan progress shown in global scan bar (bottom of page) via existing ScanProvider infrastructure
- Removed fire-and-forget `scanLibrary()` call from setup/complete API to avoid double-scanning

### Windows external player (PotPlayer) fix
- `launchMac()` now checks `playerName` before appending IINA-specific `/Contents/MacOS/iina-cli` path — generic players use `open -a` instead
- `launchWindows()` now handles PotPlayer, VLC (with `--start-time`), and generic players separately
- Root cause: any player name on macOS was treated as IINA, causing `/Contents/MacOS/iina-cli` to be appended to non-IINA paths

### Jellyfin poster/fanart naming conventions
- Scanner now searches for `{videoBaseName}-poster.*` and `{folderName}-poster.*` after standard patterns (poster.*, folder.*, cover.*)
- Scanner now searches for `{videoBaseName}-fanart.*` and `{folderName}-fanart.*` after standard patterns (fanart.*, landscape.*, backdrop.*)
- Disc poster detection also supports `{baseName}-cd{N}-poster.*` pattern

### Controller already closed error fix
- Stream API (`/api/movies/[id]/stream`) now wraps ReadableStream controller calls in try/catch with a `closed` flag
- Added `cancel()` callback to destroy the underlying fs.ReadStream when client disconnects
- Prevents `TypeError: Invalid state: Controller is already closed` when browser seeks mid-stream

### Library creation with pasted folder path
- Dashboard "Add Library" dialog now auto-includes any text in the pending folder path input when submitting
- Same fix applied to setup wizard — no more empty `folderPaths` when user pastes a path and clicks submit without pressing Enter

### Cast cards enlarged
- Movie detail page cast section: PersonCard size changed from "sm" (140x210) to "movie" (180x270) to match movie card dimensions

### Person gallery images enlarged
- Gallery target row height increased from 280px to 360px for better viewing

### Windows uninstall data cleanup option
- NSIS uninstaller now shows a Yes/No MessageBox asking whether to delete `%LOCALAPPDATA%\Kubby` user data
- Default is "No" (preserve data for future installations)
- Only deletes data directory if user explicitly confirms

## 2026-02-24: Dashboard Libraries Redesign & Scraper Icon Fix

### Media Libraries dashboard page redesigned (Jellyfin-style)
- Library cards now display cover images (fanart from random movie) in a responsive grid (2–5 columns)
- Each card shows library name overlaid on cover image with dark backdrop
- "Scan All Libraries" button added to header alongside "Add Library"
- Three-dot (⋮) dropdown menu on each card with: Scan Library, Edit, Delete
- Clicking cover image opens Edit Library dialog with full settings (name, folder paths, scraper, metadata language, Jellyfin compat)
- Delete confirmation via proper Dialog instead of native `confirm()`
- Scan progress overlay with progress bar shown directly on the card during scanning

### Scraper sidebar icon changed
- Replaced `Search` icon with `Wand2` (magic wand) icon in the admin sidebar for the Scraper Settings link
- Eliminates confusion with the search functionality icon

## 2026-02-25: Movie Bookmarks with Canvas Screenshot Capture

### Database & backend
- New `movie_bookmarks` table: id, userId, movieId, timestampSeconds, discNumber, iconType, tags (JSON), note, thumbnailPath, createdAt
- Indexes on (userId, movieId) and (movieId) for efficient querying
- `getBookmarksDir()` in paths.ts for bookmark thumbnail storage
- Inline migration (0015) with CREATE TABLE + 2 indexes

### API routes
- `GET /api/movies/[id]/bookmarks`: List user's bookmarks for a movie, ordered by timestamp asc, tags parsed from JSON
- `POST /api/movies/[id]/bookmarks`: Create bookmark via FormData (supports thumbnail file upload), saves JPG to `data/bookmarks/{userId}/{movieId}/{bookmarkId}.jpg`
- `PUT /api/movies/[id]/bookmarks/[bookmarkId]`: Update bookmark (iconType, tags, note)
- `DELETE /api/movies/[id]/bookmarks/[bookmarkId]`: Delete bookmark + cleanup thumbnail file

### Player UI
- Two bookmark buttons in right controls: Quick bookmark (Bookmark icon, blue) and Detailed bookmark (BookmarkPlus icon, yellow)
- Quick bookmark (B key): captures canvas screenshot, uploads with default settings, shows OSD "Bookmark added"
- Detailed bookmark (Shift+B): pauses video, opens overlay panel with type selector (bookmark/star), tag input (Enter to add, X to remove), note textarea
- Canvas screenshot: 320×180 JPEG at 85% quality via `<canvas>.drawImage()` + `toBlob()`
- Progress bar markers: colored dots (blue for bookmark, gold for star) at bookmark timestamps, with tooltip and click-to-seek
- `?t=SECONDS` URL parameter support for bookmark navigation (takes priority over saved position)
- Keyboard shortcuts added to help overlay

### Movie detail page
- Bookmarks section between Discs and Cast using ScrollRow with count display
- BookmarkCard component: 320×180 thumbnail card with icon, timestamp, tags, note, delete-on-hover
- Click navigates to player at bookmark timestamp (internal) or launches external player with start time
- Delete bookmark via hover trash button

### External player
- `launchExternal()` now accepts optional `startSeconds` parameter
- Stream mode: IINA gets `&start=` param, PotPlayer gets `/seek=` param in protocol URLs
- Local mode: `startSeconds` passed in POST body to play-external API
- `play-external` API: accepts `overrideStartSeconds` from body, falls back to saved position

### BookmarkCard component
- 320×180 card with thumbnail (or Clock icon fallback), bottom gradient with icon + timestamp
- Tag pills (max 3) top-right, disc badge top-left for multi-disc movies
- Delete button appears on hover (red circle with Trash2 icon)
- Renders as Link (internal player) or button (external player) based on mode

### i18n (EN + ZH)
- 14 new keys in `movies` namespace: bookmarks, addBookmark, quickBookmark, detailedBookmark, bookmarkAdded, bookmarkSaved, deleteBookmark, bookmarkType, bookmarkTags, bookmarkNote, bookmarkNotePlaceholder, saveBookmark, tagsPlaceholder

## 2026-02-25: Custom Bookmark Icons (9 Built-in + User-Uploaded)

### Built-in icons library (`src/lib/bookmark-icons.ts`)
- 9 built-in lucide icons with color theming: Bookmark (blue), Star (yellow), Zap/Action (orange), Music (violet), MessageSquare/Dialogue (emerald), Laugh/Funny (amber), Heart/Emotion (red), Eye/Visual (sky), Swords/Suspense (purple)
- `BUILTIN_BOOKMARK_ICONS` array with id, label, icon component, color classes, and hex color for inline styles
- `getBuiltinIcon(id)` helper for lookup

### Database & backend
- New `bookmark_icons` table: id, userId, label, imagePath, createdAt with user index
- DB migration 0016 (CREATE TABLE + index)
- `getBookmarkIconsDir()` in paths.ts for custom icon storage

### Custom icon API routes
- `GET /api/settings/bookmark-icons`: List user's custom icons
- `POST /api/settings/bookmark-icons`: Upload icon (FormData: label + file), validates PNG/WebP, ≤256KB, max 20 per user, sharp resize to 64×64 PNG on transparent bg
- `PUT /api/settings/bookmark-icons/[iconId]`: Update label
- `DELETE /api/settings/bookmark-icons/[iconId]`: Remove file + DB row, reset bookmarks using this icon to "bookmark" default

### Personal Metadata page — Bookmark Icons section
- New frosted-glass card with built-in icons display (read-only grid) and custom icons management
- Custom icons grid with hover X delete button, upload row with file input + label input + Upload button
- Format hint and max count display

### Player page icon selector
- Replaced 2-button bookmark/star selector with scrollable icon grid showing all 9 built-in icons + custom icons
- Each icon renders with its lucide component and color theme
- Custom icons render as `<img>` from `/api/images/{path}`
- Selected state: ring highlight with the icon's color

### BookmarkCard dynamic icon rendering
- Imports `BUILTIN_BOOKMARK_ICONS` and `getBuiltinIcon` for icon lookup
- New `customIcons` prop for custom icon data
- Bottom gradient bar: built-in icons render as colored lucide components, custom icons render as 16×16 `<img>`
- Edit dialog: same scrollable icon grid as player panel
- Progress bar markers: use `getBuiltinIcon(id)?.hexColor ?? "#ffffff"` for inline backgroundColor

### Movie detail page wiring
- Fetches custom icons via `useQuery` from `/api/settings/bookmark-icons`
- Passes `customIcons` prop to each `<BookmarkCard>`

### i18n (EN + ZH)
- 12 new keys in `personalMetadata` namespace: bookmarkIcons, bookmarkIconsDesc, builtinIcons, customIcons, uploadIcon, iconLabel, iconLabelPlaceholder, iconFormatHint, maxCustomIcons, iconUploaded, iconDeleted

## 2026-02-25: Auto-Scrape Actor Biography from TMDB Person API

### TMDB Person Details API (`src/lib/tmdb.ts`)
- New `TmdbPersonDetails` interface: birthday, deathday, biography, place_of_birth, imdb_id
- New `fetchPersonDetails(tmdbPersonId, apiKey, language)` function calling `GET /person/{id}`
- Reuses existing `fetchWithRetry()` for 429 rate-limit handling

### Scraper integration (`src/lib/scraper/index.ts`)
- During movie scraping, calls `fetchPersonDetails()` for each of the top 20 cast members
- Returns `actorBios[]` in `ScrapeResult` alongside the movie data
- 250ms rate limiting between person API calls
- Non-critical: failures skip person details silently

### Scanner person creation (`src/lib/scanner/index.ts`)
- `getOrCreatePerson()` now accepts optional `PersonBioData` parameter: tmdbId, overview, birthDate, placeOfBirth, deathDate, imdbId
- New records: all bio fields written on creation
- Existing records: missing bio fields backfilled (same pattern as photo path updates)
- `birthYear` auto-derived from `birthDate`
- TMDB supplement path (NFO has tmdbId but no actors) also fetches person details

### NFO tmdbid support
- NFO writer: `<tmdbid>` tag added inside `<actor>` blocks (both `writeFullNfo` and `writeActorsToNfo`)
- NFO parser: parses `<tmdbid>` from actor elements, stored as `actor.tmdbId`
- When NFO has tmdbId but no scraped bio data, tmdbId still passed to `getOrCreatePerson()`

### Data flow
- Scraper path: scrapeMovie() → fetchPersonDetails() → actorBios → scanLibrary() → getOrCreatePerson(bio)
- Supplement path: fetchMovieCredits() → fetchPersonDetails() → supplementBios → getOrCreatePerson(bio)
- NFO-only path: parseNfo() → actor.tmdbId → getOrCreatePerson({ tmdbId })

## 2026-02-26: README Overhaul — Bilingual, Feature Showcase, Humanized, GPL-2.0

### Bilingual README with language switcher
- `README.md` (English) and `README.zh-CN.md` (Chinese) with cross-links at the top
- Both files share identical structure and screenshot placeholders

### Feature showcase restructure
- New "Basics" section: Jellyfin-style UI, Kodi/Jellyfin library compatibility, TMDB scraper
- New "What Kubby adds" section with 7 enhanced features (each with scenario description + screenshot placeholder):
  1. Multi-dimension ratings with per-dimension sorting
  2. Poster and actor card badges (rating/resolution/tier)
  3. Actor photo gallery (justified row + lightbox)
  4. Filmography sorted by actor age at release
  5. External player integration (IINA/PotPlayer, local/stream toggle)
  6. Video bookmarks with custom icons
  7. Category-based search (movies/actors/bookmarks)
- Created `docs/screenshots/` directory for future screenshot assets
- GitHub GIF support confirmed for animated demos

### Humanizer pass (AI writing pattern removal)
- Applied humanizer skill to both English and Chinese versions
- Sentence-case headings throughout (pattern #16)
- Removed "Kubby" subject repetition in bullet lists
- Chinese version uses conversational tone: "跑一下"、"排个序"、"关掉就好" instead of formal phrasing
- No promotional language, no vague attributions

### License change
- Changed from MIT to GPL-2.0
- Created `LICENSE` file with GPL-2.0 full text
- Updated license in both README.md and README.zh-CN.md

## 2026-02-26: Search Genre/Tag Badge Fix & Backdrop Quality Improvement

### Search genre/tag preview badges
- Genre and tag preview movies in search results now show rating and resolution badges (previously missing)
- Search API: genre/tag preview queries now JOIN `user_movie_data` for `personal_rating` and SELECT `community_rating`, `video_width`, `video_height`
- Frontend: `GenreResult.previewMovies` type extended, `MovieCard` receives `rating`, `personalRating`, `videoWidth`, `videoHeight` props
- Badges now respect user badge settings consistently across all views

### TMDB backdrop resolution upgrade
- Changed `TMDB_BACKDROP_SIZE` from `w1280` (1280×720) to `original` (typically 1920×1080+)
- Matches Jellyfin's approach of downloading full-resolution backdrop images from TMDB

### Library cover card size increase
- Library cover cards enlarged from 320×180 to 360×200 (16:9 ratio preserved)

## 2026-02-27: Dimension Label Display Width Increase

### Wider dimension label truncation limits
- StarRatingDialog (movie + person): `w-[5rem]` → `w-[8rem]` (80px → 128px) — longer dimension names now visible in the popup rating dialog
- MovieMetadataEditor "Personal" tab: `max-w-[12rem]` → `max-w-[16rem]` (192px → 256px)
- PersonMetadataEditor "Personal" tab: `max-w-[12rem]` → `max-w-[16rem]` (192px → 256px)
- Full text still available via hover tooltip on all truncated labels

## 2026-02-27: Search Title Truncation & Player Controls Centering

### Search suggestion titles truncated to one line
- Movie title links in search suggestions limited to `max-w-[280px]` with `truncate`
- Prevents long titles from wrapping to two lines, shows `...` overflow
- Full title available via hover tooltip

### Player play/skip buttons absolutely centered
- Changed from `justify-between` flex layout to absolute centering (`left-1/2 -translate-x-1/2`)
- Play/pause, skip back, skip forward buttons now visually centered in the control bar regardless of left (time display) and right (bookmarks/volume/etc) group widths

## 2026-02-28: Library Scan Improvements & Bug Fixes

### Remove auto-scan, add unscanned state
- Removed auto-scan `useEffect` from homepage — libraries no longer auto-scan after setup wizard
- Library cards show "unscanned" overlay with "Scan Now" button when `lastScannedAt` is null
- User-initiated scanning instead of automatic, eliminating perceived setup page slowness

### Skipped folder tracking in scanner
- Scanner now tracks 3 skip reasons: `no_nfo`, `no_video`, `nfo_parse_error`
- `scanLibrary()` returns `{ scannedCount, removedCount, skipped }` with full skip details
- SSE progress events now include movie `title` for real-time display
- Done event includes `skippedCount` and `skipped[]` array

### Scan progress UI improvements
- Global scan bar shows current movie title during scan: "Scanning: Inception (42/100)"
- On completion with skips: "Scanned 42 movies, 5 skipped" with expandable skip list
- Each skipped folder shows reason (no NFO, no video, parse error)
- Library card shows skip count in scan result
- Long movie titles truncated with ellipsis (`max-w-[80vw]` in global bar, `max-w-full` on card)

### Scan provider state updates
- `ScanState` extended with `title` in progress and `skipped[]` array
- Result format changed from `done:count` to `done:scanned:skipped`
- `useLibraryScan` hook exposes `skipped` array

### Setup wizard library creation fix
- Fixed: if user filled folder paths but left library name empty, library was silently not created
- Now validates library name is required when paths are provided, shows error message
- Added `libraryNameRequired` i18n key (EN + ZH)

### Image path traversal check fix
- Fixed: `normalizedPath.includes("..")` substring check rejected legitimate folder names containing consecutive dots (e.g. `A...B`)
- Changed to per-segment check: `segments.some(s => s === "..")` — only rejects actual `..` traversal segments
- Folder names like `Movie... Something` or `What If..?` now serve images correctly

### PotPlayer external player fixes
- Fixed argument order: PotPlayer expects `/seek=SECONDS filepath` (seek before file path)
- Fixed seek unit: PotPlayer `/seek` takes seconds, not milliseconds (removed `* 1000`)
- Fixed in local mode (`execFile`), stream mode protocol URLs (movie detail + search page)
- Added debug logging: full command logged to server console and returned in API response `cmd` field
- Frontend logs command to browser console for easy copy-paste debugging

### i18n (EN + ZH)
- New `home` keys: scanProgressWithTitle, scanCompleteWithSkipped, unscanned, clickToScan, skippedFolders, skipReasonNoNfo, skipReasonNoVideo, skipReasonNfoParseFailed
- New `setup` key: libraryNameRequired

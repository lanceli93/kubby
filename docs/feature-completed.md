# Completed Features

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

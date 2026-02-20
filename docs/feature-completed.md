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

# Kubby Feature Implementation Patterns

How specific features are built. Read the relevant section only when you're
touching that feature — this is detail, not something to hold in context for
every task.

## Contents
- [360° panorama player](#360-panorama-player)
- [Player controls grouping](#player-controls-grouping)
- [Navigation structure](#navigation-structure)
- [GlassToast](#glasstoast)
- [Metadata Browser](#metadata-browser)
- [Metadata editor Images tab](#metadata-editor-images-tab)
- [People body metadata](#people-body-metadata)
- [ageAtRelease auto-calculation](#ageatrelease-auto-calculation)
- [Dimension management](#dimension-management)
- [Home hero mosaic wall (movies + people)](#home-hero-mosaic-wall-movies--people)
- [Favorites browser](#favorites-browser)
- [UI Design System](#ui-design-system)

## 360° panorama player

`src/components/player/panorama-360-player.tsx` — Three.js sphere + VideoTexture,
dynamic import (`ssr: false`). Player-level toggle persisted in
`user_preferences.player_360_mode`. Bookmarks save camera `view_state`
(lon/lat/fov), restored via URL `&vs=` param or seek bar click. Render loop pauses
when video is paused; pinch-to-zoom on mobile. Three.js is code-split (~500KB
chunk, dynamic import).

## Player controls grouping

`src/components/player/player-controls.tsx` — Desktop: right-side buttons organized
into 4 groups (Bookmarks | Mode | Playback | System) separated by
`w-px h-4 bg-white/20` dividers. Text buttons (360°, speed, resolution) use unified
chip style (`bg-white/10 rounded`, active `bg-primary/25 text-primary`). Mobile uses
smaller icons (`h-4 w-4`) and tighter gaps (`gap-1 md:gap-1.5`) to prevent overflow.
Fullscreen hidden on iOS (WebKit doesn't support Fullscreen API).

**Mobile skip**: no skip buttons — double-tap left/right half of screen to skip
(YouTube-style), logic in `play/page.tsx`. Single tap delayed 300ms to distinguish
double-tap, then toggles play.

**Mobile right panel**: speed (Gauge), skip duration (Timer, 1–60s slider dialog),
resolution (transcode only). Skip duration also applies to desktop skip buttons.

## Navigation structure

Three-tier navigation — content (MEDIA: All Movies) / admin (ADMIN: Libraries,
Users, System) / user (Preferences, Profile). Admin items (Libraries, Users) are
direct sidebar entries, not nested under Dashboard. System sub-pages (Overview,
Scraper, Networking) use `(system)` route group with `AdminSidebar`. Preferences
sub-pages use `PreferencesSidebar` (same pattern).

Route migrations: `/settings` → `/profile` + `/preferences/*`; `/card-badges` →
`/preferences/card-badges`; `/personal-metadata` → `/preferences/ratings-bookmarks`.

## GlassToast

`src/components/ui/glass-toast.tsx` — shared toast component used across all pages.
Glass style: `bg-[#0a0a0f]/70 backdrop-blur-2xl border-white/[0.08]
ring-white/[0.06]`. Centered bottom (`left-1/2 -translate-x-1/2`). Success = primary
Check icon, error = red AlertCircle. Supports `position="top"` for movie detail
page. `className` prop for z-index override (e.g. `z-[100]` above Dialog).
`aria-live="polite"` for accessibility.

## Metadata Browser

`src/app/(main)/metadata/browse/page.tsx` — card grid for browsing all
movies/actors with filter chips (All, Incomplete, No Overview, No Date, No Fanart +
actors-only: No Height, No Cup Size). Filter chips and card missing indicators share
the same icons (FileText/Calendar/ImageOff/Ruler/Cherry) for visual association.
Lightweight cards open `MovieMetadataEditor`/`PersonMetadataEditor` on single click.
Infinite scroll via `useInfiniteScroll` hook.

API: `GET /api/metadata/incomplete?type=movies|people&missing=&search=&page=&limit=`.
NFO writeback toggle on Providers page (`/metadata/scraper`), gated via
`settings.nfo_writeback_enabled`.

## Metadata editor Images tab

Both `MovieMetadataEditor` (General/Cast/Images/Personal) and `PersonMetadataEditor`
(General/Images/Personal) embed poster+fanart upload/delete inline — no separate
`ImageEditorDialog` needed. Mobile: vertical stack (poster `w-1/2`, fanart
`w-full aspect-video`); desktop: side-by-side (poster 180px, fanart
`flex-1 h-[250px]`). Person editor shows "Using movie fanart" badge. Dialog width
800px on desktop. `deathDate` field hidden from person editor UI (data preserved on
save).

## People body metadata

`people` table has `height` (cm), `weight` (kg), `measurements` (text, "88-60-90"),
`cup_size` (text), `whr` (real, auto-calculated from measurements). `fanart_path`
stores own fanart (DB column); person detail API falls back to movie fanart if no
own fanart, with filesystem backfill for legacy data.

## ageAtRelease auto-calculation

`computeAgeAtRelease()` in `src/lib/scanner/index.ts` (exported). Accepts
`birthDate`, `premiereDate`, `movieYear`, `birthYearOnly`. Recalculated in 3 places:
scanner, person PUT (birth info change), movie PUT (year/premiereDate change or cast
rebuild).

## Dimension management

`ratings-bookmarks/page.tsx` — managed list (not tag chips) with inline rename,
up/down reorder, weight stepper (x0.5–x3.0), delete with usage count confirmation.
Rename tracks chain (`movieRenames`/`personRenames` state) and queries original DB
key for usage count. Weights stored in `user_preferences.movie_dimension_weights` /
`person_dimension_weights` (JSON objects). `computeAverage()` in
`star-rating-dialog.tsx` uses `sum(rating×weight)/sum(weight)`. Saving preferences
batch-recalculates all `personalRating` values. Rename uses application-level
read-modify-write (not SQLite JSON functions) for reliability.

## Home hero mosaic wall (movies + people)

Home page (`src/app/(main)/page.tsx`) has 3 tabs: Home (hero mosaic wall of
movies + ScrollRows for libraries/continue-watching/favorites), Favorites
(`FavoritesBrowser`), People (full-page actor mosaic wall, no other content rows).

- **Movie wall**: `src/components/home/hero-mosaic.tsx` (shared renderer) +
  `home-hero.tsx` (movie-tab wrapper). Config in `src/lib/hero-mosaic-config.ts`
  (columns 8–24, style both/poster/fanart, angle, scroll direction, library mix,
  filters), stored as `user_preferences.hero_mosaic_config` JSON. Pool from
  `GET /api/movies/hero-wall`.
- **People wall**: `src/components/home/people-hero.tsx`, reuses `HeroMosaic` with
  style fixed to `"both"` (photo paired with the person's own fanart). Config in
  `src/lib/people-mosaic-config.ts` (columns/angle/scroll direction/includeFanart/
  includeGallery/galleryCount 0–100/rating-tier filter/favoritesOnly), stored as
  `user_preferences.people_mosaic_config`. Pool from `GET /api/people/hero-wall`
  — flattens each qualifying person into a photo entry (paired with own fanart)
  plus up to `galleryCount` gallery entries (`id` suffixed `:gN` to avoid spotlight
  addressing collisions with the photo entry), Fisher-Yates shuffled.
  **Hard rule**: a person must have a `photo_path` to enter the wall at all — no
  poster means their fanart/gallery are excluded too, not just deprioritized.
- Both walls: 8s random spotlight rotation + bottom-left caption (title/type/year/
  rating/favorite), click-through to the movie/person detail page.
- **Preferences UI**: `/preferences/hero-mosaic/page.tsx` — two sections (Movie
  wall / Actor wall) separated by a divider, each with live preview. Single Save
  button PUTs both configs in one request and invalidates both hero-wall queries.

## Favorites browser

`src/components/movie/favorites-browser.tsx` (optional `libraryId` prop) — two
sub-tabs (Movies / Actors), each a full responsive grid
(`grid-cols-2 md:grid-cols-[repeat(auto-fill,180px)]`) with infinite scroll and a
count badge on the tab. Movies query reuses `GET /api/movies?filter=favorites`;
actors query uses `GET /api/people?filter=favorites`. Mounted at both
`/movies?tab=favorites` and the home page Favorites tab. Replaced the older
single-row `FavoritesTabContent`/`FavoritesOverview` + drill-in
`FavoritesMoviesGrid`/`FavoritesActorsGrid` components (deleted).

## UI Design System

Cinema Indigo + Gold color scheme with fluid glassmorphism. Primary `#6366f1`,
gold `#ca8a04`.

Glass utilities in `globals.css`: `.glass-cinema` (panels, 0.75 opacity),
`.glass-badge` (tags), `.glass-btn` (icon buttons), `.glass-card` (content cards),
`.transition-fluid` (spring 280ms).

Border-radius hierarchy: inputs `rounded-md` (6px) → buttons `rounded-lg` (8px) →
cards `rounded-xl` (12px).

UX: `cursor-pointer` on clickables, `active:scale-95` on action buttons,
`role="alert"` on errors, `aria-label` on icon buttons.

### Pitfall: `backdrop-filter` in detail pages

Movie/Person detail glass panels use **Tailwind utility** (`backdrop-blur-[20px]`)
NOT the `.glass-cinema` CSS class. The CSS class's `backdrop-filter` doesn't work in
that context (Tailwind v4 vs custom CSS specificity issue). Also: the detail page
content-row must NOT have `animation` or `transform` — these create stacking
contexts that block `backdrop-filter` on children.

# Kubby Feature Implementation Patterns

How specific features are built. Read the relevant section only when you're
touching that feature — this is detail, not something to hold in context for
every task.

## Contents
- [360° panorama player](#360-panorama-player)
- [Player controls grouping](#player-controls-grouping)
- [Navigation structure](#navigation-structure)
- [Domain switcher + photos navigation](#domain-switcher--photos-navigation)
- [Photos timeline + albums + lightbox](#photos-timeline--albums--lightbox)
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

## Domain switcher + photos navigation

The 🎬 Cinema / 📷 Photos switcher is a **dropdown on the Kubby brand** in
`AppHeader` (`Kubby ▾` with Clapperboard/Images items + a Check on the active
domain), not a second pill group. This was a deliberate de-clutter: the header
already carries the home content Tabs (`首页/收藏/演员`), and two visually identical
pill rows at different hierarchy levels read as messy. The dropdown only renders
when `useHasPhotoLibrary()` is true; with no photo library the brand is a plain
`/` link. `NavSidebar` (Media group) and `BottomTabs` likewise gate their `/photos`
entry on `useHasPhotoLibrary()`.

`useHasPhotoLibrary()` (`hooks/use-has-photo-library.ts`) reuses the `["libraries"]`
React Query cache (5-min staleTime) → `data?.some(l => l.type === "photo")`, so it
adds no extra request. `DomainCookieSync` (see architecture.md → Domains) persists
the domain cookie and self-heals a stale `photos` cookie.

## Photos timeline + albums + lightbox

**Shell** (`app/(main)/photos/page.tsx`): a `Timeline | Albums` segmented control
plus a library-filter dropdown that appears **only when >1 photo library** exists
(`usePhotoLibraries()`, derived from the shared `["libraries"]` cache). Timeline
also has a multi-select mode → bulk **add-to-album** (`AddToAlbumDialog`, pick an
existing album or create one inline).

**Grid** (`components/photos/photo-grid.tsx`) — shared by the timeline and album
detail. Month-grouped justified grid via `useInfiniteQuery` with **cursor**
pagination (not offset): cursor `"{takenAt}_{id}"`, predicate
`(takenAt < c) OR (takenAt = c AND id < c.id)`, sorted `taken_at DESC, id DESC`.
Row-level **virtual scrolling** (`@tanstack/react-virtual`): month headers and
justified grid rows interleaved as virtual rows. `computeJustifiedLayout()` in
`lib/photos/justified-layout.ts` is a pure function → equal-height rows, last row
not stretched; ResizeObserver relayouts. **queryKey is scoped**:
`["photos", {libraryId, albumId}]` — so the timeline, a filtered library, and each
album are separate cache entries. Tile hover feedback is **contained** (inner image
`scale-[1.06]` + inset ring + bottom scrim revealing the capture date); the tile
itself never grows — scaling it would tear the justified row and trigger a
horizontal scrollbar inside the virtualizer.

**Albums** are manual, user-created categories within a photo library (NOT scan
folders — see architecture.md → Photos domain tables). `AlbumsView`
(`albums-view.tsx`) is a cover+count card grid + a create card; album detail
(`photos/album/[id]/page.tsx`) reuses `PhotoGrid` scoped by `albumId`, with header
rename/delete and multi-select remove-from-album. Deleting an album removes only
the category; the photos stay.

**Lightbox** (`app/(main)/photos/view/[id]/page.tsx`): full-screen `fixed inset-0`.
Its queryKey **must match PhotoGrid's** — it reads `?lib=`/`?album=` from the URL to
rebuild the same scoped key, so prev/next (←/→/swipe, `router.replace`) walks the
same set from cache; those params are preserved across navigation. Wheel/double-
click zoom + drag-pan, ⊞ add-to-album (fetches the item's `libraryId` from the
`["photo", id]` detail cache), ⓘ EXIF panel (`LightboxInfoPanel`), neighbor preload.
Image loading: a **crisp cached thumbnail** shows instantly as a base, then the
full image **crossfades in** over it (no blur→sharp pop — the old `blur-lg`
placeholder was replaced because it felt rigid). Video items render `LightboxVideo`
(`components/photos/lightbox-video.tsx`): the `<video>` **fills the stage
immediately** with a spinner (cleared on `loadeddata`/`playing`) so it opens like a
real web player instead of a tiny box that grows when metadata loads; iOS-detect →
`decide?noHevc=1`, then direct play or hls.js/native HLS; DELETEs the transcode
session on unmount.

**Theme**: same dark cinema tokens as the rest of the app (`--header`,
`text-muted-foreground`, `bg-white/[0.06]`) — not a light photo-album theme. This
was an explicit user correction; keep future domains on the shared dark theme.

**Domain isolation**: photo libraries must not leak into cinema-domain UI. The
cinema home Media Libraries row, search library filter, and hero-mosaic
per-library weights all read the shared `["libraries"]` cache and filter
`type !== "photo"` client-side (the API stays untouched — the cache is shared with
nav / `useHasPhotoLibrary` / `DomainCookieSync`).

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

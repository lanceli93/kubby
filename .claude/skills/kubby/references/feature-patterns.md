# Kubby Feature Implementation Patterns

How specific features are built. Read the relevant section only when you're
touching that feature — this is detail, not something to hold in context for
every task.

## Contents
- [360° panorama player](#360-panorama-player)
- [Player controls grouping](#player-controls-grouping)
- [Navigation structure](#navigation-structure)
- [Domain switcher + photos navigation](#domain-switcher--photos-navigation)
- [Movie poster card hover](#movie-poster-card-hover)
- [Photos timeline + albums + lightbox](#photos-timeline--albums--lightbox)
- [Music library + global player](#music-library--global-player)
- [Cross-domain safety (a hard rule)](#cross-domain-safety-a-hard-rule)
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

## Movie poster card hover

`components/movie/movie-card.tsx` — the reference hover treatment for the whole
app. On hover the card composes several affordances at once:
- **Whole card scales** `hover:scale-[1.03]` (outer wrapper, `transition-[scale]`);
  also pinned to `scale-[1.03]` while the more-menu is open (`menuOpen`).
- **3D tilt + glare** via `TiltCard` (`components/ui/tilt-card.tsx`) wrapping the
  poster: pointer-driven rotateX/rotateY (`[transform-style:preserve-3d]`) + a
  cursor-following radial glare (`group-hover/tilt:opacity-100`). Disabled while the
  menu is open.
- **Ambient glow** — a blurred, `saturate-150` copy of the poster bleeds behind at
  `scale-110`, `opacity-0 group-hover:opacity-55` (only when `posterBlur` exists).
- **Centered play button** `scale-75 opacity-0 group-hover:scale-100
  group-hover:opacity-100`, lifted toward the viewer in 3D (`--tilt-lift: 40px`).
- **Gradient-scrim overlay bar** (`bg-gradient-to-t from-black/85…`, NOT
  backdrop-blur — preserve-3d breaks backdrop-filter on descendants) with
  watched / favorite / more-menu buttons.
- **Badges lift on tilt** — resolution/rating badges use `tilt-lift`
  (`--tilt-lift: 22px`) so they float above the poster plane.

The photo timeline tile (see below) is a deliberately **contained** cousin of this:
it borrows the language (inner image zoom + ring + scrim) but the tile itself must
NOT scale/tilt, because it lives in a justified virtual-scroll row.

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

**Domain isolation**: photo (and music) libraries must not leak into cinema-domain
UI. The cinema home Media Libraries row, search library filter, and hero-mosaic
per-library weights all read the shared `["libraries"]` cache and filter to
`type === "movie"` client-side — a positive allowlist, NOT a blocklist (an earlier
`!== "photo"` blocklist leaked music libraries once Music shipped; see Cross-domain
safety below). The API stays untouched — the cache is shared with nav /
`useHasPhotoLibrary` / `DomainCookieSync`.

## Music library + global player

The third domain (after cinema + photos), built to the same domain-separation rules
— its own tables, scanner branch, `/api/music/*` routes, and `/music` homepage; no
forking of the movie path. See architecture.md → Domains / Music Scanner / Audio
Playback for the data model, scan, and streaming internals; this section is the
UI + client-state wiring.

**Shell** (`app/(main)/music/page.tsx`): `Tabs` (Albums / Artists / Songs) mirroring
the movies-page tab shell, plus a top `ScrollRow` band of recent albums. Each tab is
a responsive grid/list with `useInfiniteScroll` + the glass sort dropdown (Albums
sort title|year|dateAdded, etc). Album detail (`music/albums/[id]`) is a hero cover +
meta + "Play all" + `TrackRow` list; artist detail (`music/artists/[id]`) is a header
+ album grid.

**Cards** reuse the cinema hover language: `AlbumCard` (`components/music/album-card.tsx`)
is a square cover wrapped in `TiltCard` with the same blurred-copy ambilight glow as
`MovieCard` (see Movie poster card hover) + a centered play button that plays the
whole album. `ArtistCard` is a circular image + "N albums". `TrackRow` highlights
when it is the player's current track.

**Global player** — the key architectural piece:
- `providers/music-player-provider.tsx` is a Zustand-free **external store**
  (`useSyncExternalStore`, mirroring `scan-provider.tsx`): module-level `state` +
  `listeners` + `emitChange()` that swaps in a new reference. Actions
  (`playTrack`/`playAlbum`/`toggle`/`stop`/`playPauseTrack`/`next`/`prev`/`seek`/
  `setVolume`/`toggleShuffle`/`cycleRepeat`) are module-level singletons, so
  components can use them without memoization. `useMusicPlayer()` returns live state + actions +
  `currentTrack`/`currentTrackId`.
- **A single persistent `<audio>` lives inside the provider** (hidden, never
  unmounted) and the provider is mounted **unconditionally** in `(main)/layout.tsx`
  (NOT inside any page) so route navigation never tears down playback. Only the
  *visible* `NowPlayingBar` is gated (`NowPlayingBarGate` → `useHasMusicLibrary()`).
- Play-count fires once per track-start on the `<audio>` `play` event
  (`PUT .../user-data {incrementPlay:true}`), guarded by a module `countedTrackId`
  so seeking/pausing never re-counts. Failures are swallowed — a count must never
  interrupt playback.
- `stop()` action clears the queue + audio `src` so `currentTrack` becomes null
  and the bar unmounts — this is the "close the player" primitive. The docked bar
  (right cluster, after volume/expand) and the overlay top bar each expose an `X`
  close button (`t("closePlayer")`) that calls it and also drops `expanded`.
- `NowPlayingBar` (`components/music/now-playing-bar.tsx`): fixed glass bar at
  `bottom-[calc(3.5rem+env(safe-area-inset-bottom))]` on mobile (above BottomTabs,
  tracking its safe-area height) / `md:bottom-0`; click the cover/title to
  expand a full-screen `fixed inset-0` Now Playing overlay with a blurred cover
  backdrop. The overlay is a **non-scrolling flex row** — desktop is two columns
  (player left, a `歌词/播放队列` tabbed panel right, **lyrics open by default**);
  each pane scrolls internally so the cover/transport never move. Mobile uses a top
  segmented `正在播放 / 歌词 / 播放队列` switch (state: `mobileView "cover"|"panel"`
  × `panel "lyrics"|"queue"`) plus a mini transport pinned under the panel. The
  small pill switcher is the local `Segmented` component. Overlay top bar +
  mobile transport fold the safe-area inset into their padding via calc (not
  `pt-safe`/`pb-safe` — see the safe-area pitfall under UI Design System).

**Domain integration** (same shared-cache pattern as photos): `useHasMusicLibrary()`
reads the `["libraries"]` React Query cache (`type === "music"`, no extra request).
The `AppHeader` brand dropdown, `NavSidebar`, and `BottomTabs` each add a `/music`
entry only when it's true; `DomainCookieSync` tracks `music` as a third
`kubby-domain` value and self-heals a stale `music` cookie when no music library
exists; `auth.config.ts` redirects `/` → `/music` when that cookie is set. Music
libraries force `scraperEnabled=false, jellyfinCompat=false, metadataLanguage=null`
server-side, same as photo.

**Management (edit / delete / upload) — admin-gated.** The music domain started
read-only; CRUD was added mirroring the movie card pattern:
- `MusicItemMenu` (`components/music/music-item-menu.tsx`) is the shared ⋯ menu
  (Edit / Delete), rendered only when `session.user.isAdmin`. It owns the
  `MusicMetadataEditor` (album/artist/track three-in-one form) + `MusicDeleteDialog`
  (an "also delete source files" checkbox, **default off → DB-only**, like the
  movie delete dialog), performs the `DELETE`, and invalidates the caller's query
  keys. Wired into album detail (header + each `TrackRow`), artist detail (header),
  and the Songs tab. `TrackRow` gained an optional `menu` slot.
  - Gotcha: opening the editor from a card that lacks `genres` must NOT wipe them
    — the editor only sends/edits `genres` when `initial.genres !== undefined`.
- Server routes: `PUT`/`DELETE` on `/api/music/{albums,artists,tracks}/[id]`
  (see architecture.md → API). `lib/music/mutations.ts` centralises the shared
  cleanup: prune empty albums, prune orphan artists (global sweep), remove the
  album's **generated** cover art under `metadata/music-art/{libraryId}` (a Kubby
  artifact — always removed), and `deleteFiles` source-file + empty-dir removal.
  Deleting an artist removes their whole catalogue (track-artist ∪ album-artist).
  Caveat: an incremental re-scan overwrites DB edits when a file's mtime/size
  changes (edits live in the DB layer, not written back to tags).
- Upload: `MusicUploadButton` (music page Tabs, admin-only) → `POST /api/music/upload`
  (multipart, music libraries only, streams to `{libraryFolder}/Uploads/`), then
  reuses `scan-provider`'s `startScan` to ingest. Multi-library → dropdown to pick
  the target; single/filtered library → straight to the file picker.

**Lyrics.** `music_tracks.lyrics` (inline text, migration 0039) is filled by the
scanner (`.lrc` sidecar > embedded `common.lyrics`; synced entries serialised to
LRC `[mm:ss.xx]`, else plain text — `lib/music/lyrics.ts`). `GET
/api/music/tracks/[id]/lyrics` serves it and **back-fills on first request** for
libraries scanned before lyrics support (parse the file, cache the result; `""`
means "checked, none" so a lyric-less track isn't re-parsed). `LyricsView`
(`components/music/lyrics-view.tsx`) parses LRC and, when synced, highlights the
active line for `currentTime` and keeps it centered; clicking a timed line calls
`onSeek`. Plain lyrics render as a centered block. It's the **default** panel in
the Now Playing overlay (see `NowPlayingBar` above).
  - **Critical scroll rule**: the active line is centered by scrolling the lyrics
    container ITSELF (compute the delta from `getBoundingClientRect`, then
    `container.scrollTo`) — **never `scrollIntoView`**, which bubbles up and scrolls
    every scrollable ancestor, dragging the whole overlay down as the song plays
    (the original bug). The container is bounded, self-scrolling, has hidden
    scrollbars + top/bottom fade masks (`.music-lyrics-scroll` in globals.css), and
    big top/bottom padding so first/last lines can reach the centre.

## Cross-domain safety (a hard rule)

**Cross-domain operations are a cardinal sin.** Cinema / Photos / Music share ONE
`media_libraries` table (distinguished by `type`) and the `["libraries"]` cache, so
it's easy for code scoped to one domain to accidentally read, display, or *delete*
another domain's data. Three real bugs shipped from exactly this and were fixed —
learn from them:

- **Blocklist filters rot when a domain is added.** Cinema-domain UI (home Media
  Libraries row `app/(main)/page.tsx`, search library filter `search/page.tsx`,
  hero-mosaic weights `preferences/hero-mosaic/page.tsx`) filtered with
  `type !== "photo"` — so when Music arrived, music libraries leaked into cinema UI.
  **Always use a positive allowlist (`type === "movie"`), never a blocklist.** A new
  domain must be invisible to old domains by default, not by remembering to exclude
  it everywhere.
- **Per-domain counts must pick the right table.** `GET /api/libraries[/:id]`
  counted `movies` unconditionally, so photo/music libraries always showed `· 0`.
  Count per `type` via a `CASE` (movies / photo_items / music_tracks). The field is
  still aliased `movieCount` for consumers, but the query is domain-aware.
- **Delete must clean up ONLY its own domain, and ALL of it.** `DELETE
  /api/libraries/[id]` (a) read `lib.type` *before* the cascade wipes rows, then
  gated NFO-deletion and orphan-people cleanup behind `type === "movie"` — the
  orphan-people sweep is **global** (scans actors across every cinema library), so
  running it while deleting a music/photo library is an out-of-domain data-loss
  side effect; and (b) removes the domain's on-disk generated artifacts, which the
  FK cascade does NOT touch: `metadata/photo-thumbs/{libraryId}/` for photo,
  `metadata/music-art/{libraryId}/` for music. The delete **dialog** is likewise
  type-aware (`dashboard/libraries/page.tsx` + `LibraryCard`): movie-only options
  (orphan cleanup, NFO deletion) are hidden and forced `false` for other domains,
  with per-type confirmation copy (`confirmDeleteLibrary{,Photo,Music}` i18n keys).

The general shape: **allowlist the current domain, gate every destructive/global
side-effect on the library's own `type` (defence-in-depth on the server, not just
the UI), and when a domain writes generated files under `metadata/…/{libraryId}/`,
its delete path owns removing them.**

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
- **Movie hero height**: desktop is `md:h-[calc(100vh-340px)]` (mobile
  `h-[52vh]`), NOT a fixed vh. The 340px is a constant overhead (top padding + one
  Media Libraries ScrollRow ≈ 248px + ~40px bottom margin) so that on a 16:9 screen
  the hero + exactly one library row fill the fold and Continue Watching stays just
  below it — and this holds across 1080p/1440p/4K because the overhead is fixed, not
  proportional. The loading-placeholder skeleton in `home-hero.tsx` uses the SAME
  height class as the real hero; keep them in sync or the rows jump when the wall
  pops in. (Home header is transparent/`absolute`, so the scroll viewport ≈ full
  `100vh` — the math assumes that.)
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

### Accessibility primitives (`globals.css`)

- **`.focus-ring`** — keyboard-only focus indicator (`:focus-visible` → double
  `box-shadow`: `--background` gap + `--ring`). Add this class to EVERY custom
  interactive element; the codebase uses `outline-none` pervasively with no
  replacement, so without it keyboard users can't see focus. Never shows on
  mouse/touch, so the look is unchanged during pointer use. Range sliders instead
  reveal their thumb via `.music-range:focus-visible` — don't double up.
- **`.pb-safe` / `.pt-safe`** — `padding-{bottom,top}: max(0px, env(safe-area-inset-*))`
  for fixed bars near the notch / home indicator. **Pitfall: these are unlayered
  CSS and fully OVERRIDE Tailwind's layered `py-*` on the same box** — on a device
  with no inset (`env()` → 0) that zeroes the base padding. If the element already
  needs base padding, DON'T stack `pt-safe` over `py-4`; fold the inset into a
  calc instead: `pt-[calc(1rem+env(safe-area-inset-top))]` (see the Now Playing
  overlay top bar + mobile transport, and the photos lightbox top bar). `.pb-safe`
  is safe on `bottom-tabs` because that box has no competing `py-*`.
- Selection/row semantics: a multi-select tile toggles `role="checkbox"` +
  `aria-checked` in selection mode (`PhotoTile`); a clickable row that already
  nests buttons uses `role="button"` + `tabIndex` + Enter/Space `onKeyDown`
  (`TrackRow` — a real `<button>` wrapper around nested buttons is invalid HTML).
  Sub-44px icon buttons get their hit area grown via `p-2.5 -m-2.5` (pad without
  moving the visible glyph). `sr-only` (Tailwind built-in) gives animated/icon-only
  affordances a text alternative (e.g. "Now Playing" beside the eq bars).

### Pitfall: `backdrop-filter` in detail pages

Movie/Person detail glass panels use **Tailwind utility** (`backdrop-blur-[20px]`)
NOT the `.glass-cinema` CSS class. The CSS class's `backdrop-filter` doesn't work in
that context (Tailwind v4 vs custom CSS specificity issue). Also: the detail page
content-row must NOT have `animation` or `transform` — these create stacking
contexts that block `backdrop-filter` on children.

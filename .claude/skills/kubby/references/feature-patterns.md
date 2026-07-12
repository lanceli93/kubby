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
- [TV series domain (shows/seasons/episodes)](#tv-series-domain-showsseasonsepisodes)
- [Cross-domain safety (a hard rule)](#cross-domain-safety-a-hard-rule)
- [Demo Mode (seed + clear/factory-reset)](#demo-mode-seed--clearfactory-reset)
- [Backend review checklist](#backend-review-checklist)
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

Three-tier navigation — content (MEDIA: current domain's All-X entry) / admin
(ADMIN: Libraries, Users, System) / user (Preferences, Profile). Admin items
(Libraries, Users) are direct sidebar entries, not nested under Dashboard. System
sub-pages (Overview, Scraper, Networking) use `(system)` route group with
`AdminSidebar`. Preferences sub-pages use `PreferencesSidebar` (same pattern).

**Domain-following (Plan A).** The chrome is organized by media domain so the
photos/music domains don't inherit cinema-only entries:
- `NavSidebar`'s top "MEDIA" group is the domain switcher itself (see Domain switcher
  below) — one row per existing domain (Cinema always; TV/Photos/Music gated on the
  library-presence hooks), the active one highlighted + checked via
  `useCurrentDomain()`. It replaced the old cinema-only `Home` item + the single "All
  X" media entry (those were redundant with a domain list). The Metadata group
  (scraper + browse) is cinema-only (`isAdmin && domain === "cinema"`).
- `PreferencesSidebar` groups its entries into **Cinema** (hero-mosaic, card-badges,
  ratings-bookmarks, playback) + **General** (language). Routes are unchanged — only
  the sidebar grouping. i18n: `preferences.groupCinema` / `groupGeneral`.
- The libraries dashboard (`dashboard/libraries/page.tsx`) renders cards in fixed-
  order **type sections** (movie → photo → music, empty sections hidden, unknown
  types fall into a trailing "Other" section so nothing is dropped). Type-specific
  form branches use a `type === "movie"` **allowlist**, never a
  `!== "photo" && !== "music"` blocklist (cross-domain-safety rule).
- `useCurrentDomain()` (`hooks/use-current-domain.ts`): path decides for domain-owned
  routes, else the `kubby-domain` cookie via `useSyncExternalStore` (SSR snapshot
  `cinema`). i18n: `nav.allPhotos` / `nav.allMusic`, `dashboard.libraryTypeMovie`.

Route migrations: `/settings` → `/profile` + `/preferences/*`; `/card-badges` →
`/preferences/card-badges`; `/personal-metadata` → `/preferences/ratings-bookmarks`.

## Domain switcher + photos navigation

There are **two** cross-domain switchers, both listing Cinema → TV → Photos → Music
(each non-cinema row gated on its `useHas*Library()` hook) and both marking the
active domain with a Check:

1. **The Kubby brand dropdown** in `AppHeader` (`Kubby ▾` with Clapperboard/Tv/Images/
   Music items). This was a deliberate de-clutter: the header already carries the home
   content Tabs (`首页/收藏/演员`), and two visually identical pill rows at different
   hierarchy levels read as messy. It only renders when at least one of photo/music/tv
   libraries exists; otherwise the brand is a plain `/` link. **Caveat: the brand
   dropdown is replaced by back-nav on detail / library / search / preferences pages**
   (`needsBackNav`), so it is NOT available everywhere.
2. **The left drawer's top "MEDIA" group** (`NavSidebar`) — the always-available
   switcher, present on every page. It renders one row per existing domain, the active
   one highlighted (`bg-white/[0.08] text-primary ring-1`) + checked via
   `useCurrentDomain()`; each row links to that domain's home (`/`, `/tv`, `/photos`,
   `/music`). This replaced the old cinema-only `Home` item + the redundant
   single-entry Media group (which duplicated what a domain list already conveys). It
   reuses the `nav.media` label + the same `useHas*Library()` hooks as the header
   dropdown — no new i18n keys.

`BottomTabs` still shows only the *current* domain's entry (see Navigation structure →
Domain-following), not one per existing library.

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

The third domain (after cinema + photos; TV was the fourth), built to the same
domain-separation rules — its own tables, scanner branch, `/api/music/*` routes, and
`/music` homepage; no forking of the movie path. See architecture.md → Domains /
Music Scanner / Audio Playback for the data model, scan, and streaming internals;
this section is the UI + client-state wiring.

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
  tracking its safe-area height) / `md:bottom-0`; click the cover/title to expand a
  full-screen `fixed inset-0` Now Playing overlay. The overlay is a **QQ-Music-style
  layout** (redesigned from the earlier two-column player + tabbed panel):
  - **Desktop** is a non-scrolling **column**: a content row that grows (left =
    rotating `VinylDisc` + meta; right = **centered** `LyricsView align="center"`,
    lyrics-only — the queue moved to a drawer), then a floating **spectrum row**,
    then the **bottom transport bar** (the "docker"). The real-audio `AudioSpectrum`
    (`max-w-xl`, inset by the time-label width so it's the same length as the seek
    bar) **floats ABOVE the docker in its own row** — not inside the bordered bar —
    so it blooms up over the transport, QQ-style (律动效果放在 docker 上面而不是里面;
    等长, 在上部). The docker itself is a left info cluster (mini circular cover +
    title/artist + `FavoriteHeart`) · a **centered stack** (`max-w-xl`) of the
    transport (shuffle/prev/**capsule play button** `h-9 w-14 rounded-full` — pill,
    kept at icon-button height so it adds no row height — /next/repeat with the
    `VolumePopover` folded in on its right) over a matched-width `SeekBar` with edge
    time labels · a right cluster (`播放队列` drawer toggle). Each pane scrolls
    internally so the disc/transport never move.
  - **Queue drawer** (desktop): a `queueOpen` boolean opens a right-anchored panel
    (`animate-slide-in-right`, `top: calc(64px + inset)` so it clears the top bar)
    with a **frosted-glass** treatment mirroring the homepage `NavSidebar` drawer —
    a dimming `bg-black/50 backdrop-blur-sm` click-to-close scrim + a translucent
    `bg-[#0a0a0f]/70 backdrop-blur-2xl` panel with an inset edge-highlight
    (`shadow-[inset_0.5px_0_0_rgba(255,255,255,0.06)]`). Reuses the `TrackRow` map.
  - **Mobile** keeps the top segmented `正在播放 / 歌词 / 播放队列` switch (state:
    `mobileView "cover"|"panel"` × `panel "lyrics"|"queue"`, MOBILE-only now — desktop
    no longer uses `panel`) + a mini transport; the `正在播放` view shows the
    `VinylDisc` + a compact `AudioSpectrum`. The small pill switcher is the local
    `Segmented` component.
  - `FavoriteHeart` + `VolumePopover` are local helpers. `FavoriteHeart` owns its
    own `useQuery`/`useMutation` on `/api/music/tracks/[id]/user-data` (favorite state
    is NOT threaded through the player store — same as `TrackRow`). Overlay top bar +
    mobile transport + bottom bar fold the safe-area inset into their padding via calc
    (not `pt-safe`/`pb-safe` — see the safe-area pitfall under UI Design System).
  - **Viewport-relative sizing (QQ-style)**: both columns scale with the window so a
    large/fullscreen overlay doesn't leave the components small. The vinyl is
    `md:max-w-[min(58vh,40vw)]` (bounded by BOTH axes so it never overflows), the
    title/artist/album use `text-[clamp(...vw...)]`, and the lyrics lines are
    `md:text-[clamp(1.25rem,1.5vw,1.875rem)]` in a `md:max-w-[min(40vw,720px)]`
    container. Fixed `md:max-w-…px` caps were the "components too small on fullscreen"
    bug — prefer `vh`/`vw`/`clamp` over px caps here.
- **Rotating vinyl** — `components/music/vinyl-disc.tsx` (`VinylDisc`): a simple dark
  grooved disc (CSS `repeating-radial-gradient` rings, NOT a skeuomorphic turntable)
  with the album cover as a large **circular center label (~64% of the disc
  diameter** — deliberately large so the cover dominates and the black ring stays
  thin) + a spindle hole. Spins via `.music-vinyl-spin` (`@keyframes vinylSpin`,
  globals.css, 24s linear); `animationPlayState` is bound to `isPlaying` so it
  **freezes on pause**; `prefers-reduced-motion` disables the spin.
- **Real audio spectrum (光柱)** — `components/music/audio-spectrum.tsx`
  (`AudioSpectrum`, props `{className, bars=48, color}`) draws live frequency data on
  a DPR-scaled `<canvas>` (rAF `getByteFrequencyData`). It taps the singleton
  `<audio>` via the provider's exported **`ensureAnalyser(): Promise<AnalyserNode |
  null>`**. Safe-sequencing rules that MUST hold (audio must never be silenced):
  `createMediaElementSource` is one-shot per element and reroutes output, so it's
  only reached once `audioCtx.state === "running"` (resume-first, bail before
  rerouting); the graph is **never disconnected** (the element is a persistent
  singleton — disconnecting would mute all playback after the overlay closes); and
  the build is **memoized on an in-flight promise** (`analyserBuild`) so the two
  concurrent `AudioSpectrum` mounts (desktop bottom bar + the `md:hidden` mobile one,
  both in the DOM) — and React StrictMode double-mount — share ONE build instead of
  racing into a second `createMediaElementSource` that throws + nulls the valid node.
  On failure the memo is cleared so a later user-gestured call can retry. Reduced-
  motion / no-analyser → a static faint idle bar row.
- **Adaptive ambient glow** — the overlay tints its background halo to the current
  album cover's dominant hue by reusing `extractAmbientColor(currentTrack.coverBlur)`
  (`lib/ambient-color.ts`, the same helper the home hero uses; effect keyed on the
  blur URL with a `cancelled` guard, state set only from the async callback). The hue
  drives both a radial-gradient wash layer (`transition-[background] duration-700` so
  it eases when the track changes) over the existing blurred-cover backdrop, and the
  `AudioSpectrum` `color` (falls back to `--primary` when extraction returns null).

**Domain integration** (same shared-cache pattern as photos): `useHasMusicLibrary()`
reads the `["libraries"]` React Query cache (`type === "music"`, no extra request).
The `AppHeader` brand dropdown adds a `/music` entry only when it's true; `NavSidebar`
and `BottomTabs` show the `/music` entry when `useCurrentDomain() === "music"` (see
Navigation structure → Domain-following). `DomainCookieSync` tracks `music` as a
third `kubby-domain` value and self-heals a stale `music` cookie when no music
library exists; `auth.config.ts` redirects `/` → `/music` when that cookie is set.
Music libraries force `scraperEnabled=false, jellyfinCompat=false, metadataLanguage=null`
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

## TV series domain (shows/seasons/episodes)

The fourth domain. Unlike photos/music (which dropped scraper/NFO/player), TV is the
closest sibling to cinema — it **mirrors the movie skeleton** but stays a separate
domain with isolated cast. Built from the movie/music patterns; the pieces worth
knowing when extending it:

- **Three-tier data + scanner** (`scanner/tv-scanner.ts`, dispatched from
  `scanner/index.ts` by `type === "tvshow"`). `parseEpisodeFilename` handles `SxxExx`
  (+ multi-episode `S01E01-E03` → `episode_number_end`), `1x05`, and cross-checks the
  parent `Season NN` / `Specials` (→ season 0) folder. **Guards** (learned from
  Jellyfin): reject a season number in 200–1927 or > 2500 (year misreads) and never
  read a `1920x1080`-style resolution token as SxxExx. `scrapeTvShow`
  (`scraper/index.ts`) does search→details→per-season `getTvSeasonDetails`, downloading
  show poster/fanart, `season{NN}-poster.jpg`, and per-episode stills into `.stills/`.
  Upsert keys: show by `folder_path`, episode by `file_path`. Cleanup is FK-safe order
  (episodes → empty seasons → empty shows).
- **Isolated cast.** `getOrCreateTvPerson` writes ONLY `tv_people`/`tv_show_people`
  (photos under `metadata/tv-people/`). The cinema `people` table is never touched, so
  the movie orphan-people sweep and TV orphan sweep are independent (see Cross-domain
  safety). This was an explicit product decision (no shared actors across domains).
- **Shared player via `basePath`.** Rather than fork the 699-line movie play page,
  `usePlaybackSession`/`useProgressSave` take a `basePath` option; the TV play page
  (`app/(main)/tv/episodes/[id]/play/page.tsx`) passes `/api/tv/episodes/{id}` and the
  movie page passes `/api/movies/{id}`. The decide/stream/keyframes/frame/bookmarks
  routes under `/api/tv/episodes/[id]/*` are copies of the movie routes with the disc
  logic dropped (episodes are single-file, `discNumber` always 1) and the iOS-HEVC
  decide block reading `tv_media_streams` by `episode_id`. **The raw episode stream
  path must be in the `auth.config.ts` public allowlist** (`/^\/api\/tv\/episodes\/[^/]+\/stream\/?$/`)
  so the `<video>` element can load it, mirroring the movie stream exception — decide
  and everything else stay authenticated.
- **Next Up / progress.** Progress is per-episode (`user_episode_data`); the show-level
  `user_tv_show_data.last_played_at` is bumped on every episode progress PUT and drives
  `GET /api/tv?filter=next-up`, which returns one episode per active show (in-progress
  episode, else first unwatched by (season, episode) order). Season/show unwatched
  counts are computed live in the detail route, never stored. Auto-play-next on the
  player fetches `/api/tv/{showId}`, flattens episodes by (season, episode), and pushes
  the next one on `ended` (guarded to fire once).
- **Home page mirrors the cinema home** (`app/(main)/tv/page.tsx`): an animated poster
  wall (`<TvHero>` wrapping the shared, domain-agnostic `HeroMosaic` — pool from
  `GET /api/tv/hero-wall`, which random-samples shows with a poster/fanart; wall needs
  ≥8 usable shows or it falls back to a single backdrop), a **Media Libraries** row, the
  Next Up + Recently Added bands, and the all-shows grid. Reused shared components are
  parameterized rather than forked so they can't leak cinema URLs: `LibraryCard` takes
  `hrefBase` (TV passes `/tv`, default `/movies`) + `countLabel` (episode count); the row
  uses a positive `type === "tvshow"` allowlist off the shared `["libraries"]` cache.
  `TvHero` has no carousel/disc/runtime logic (resume happens per-episode via Next Up).
- **Isolated person page** (`app/(main)/tv/people/[id]/page.tsx` + `GET /api/tv/people/[id]`).
  TV cast are `tv_people` rows; they must NOT resolve against the cinema `people` table.
  `PersonCard` takes `hrefBase` (TV passes `/tv/people`) + `readonly` (hides the
  edit/edit-images/delete menu, whose dialogs hit cinema `/api/people/*`). The TV person
  route is read-only (no user-data/gallery/metadata-editor tables exist for tv_people) —
  it returns the bio + the shows the person appears in, linking back to `/tv/{showId}`.
  **The bug this fixed:** the cast rendered via `PersonCard` with the default
  `/people/{id}` href, so clicking a TV actor hit `/api/people/{tvId}` → 404 `{error}`;
  the cinema person page's `if (!person)` guard treated that truthy error object as valid
  and crashed on `person.name[0]`. Both person pages now require `person.name` before
  rendering (an `{error}` body has none). See Cross-domain safety.
- **Gotcha found in verification:** `tv_shows.country` is stored as a **plain string**
  (`origin_country[0]`, e.g. `"US"`), not JSON — the detail route wraps it as
  `[country]` rather than `JSON.parse` (which threw a 500 → white-screen). genres/
  studios/tags ARE JSON arrays. When mirroring a movie route, check each column's
  actual storage shape, don't assume.
- **Header blends with the hero (not a solid nav bar).** The transparent/`absolute`
  `pointer-events-none` `AppHeader` treatment (`isTransparent`) that lets the hero
  bleed up underneath is keyed by pathname; `/tv`, `/tv/{id}`, and `/tv/people/{id}`
  are in that allowlist (matched with `/^\/tv\/[^/]+$/` etc. so `/tv/people/{id}` and
  `/tv/episodes/...` don't collide). TV detail pages join `needsBackNav` and their
  home link is domain-aware (`/tv`, not `/`). The TV episode player is hidden via the
  same `if (isPlayerPage || isTvPlayerPage) return null` early-return the movie player
  uses — omitting it was a real bug (the play page mounts under `(main)/layout.tsx`).
  The TvHero already paints a top scrim + full-bleed top-anchored layout for exactly
  this, so blending needed only the header allowlist, no hero change.
- **`/tv` is a hero landing; `/tv/browse` is the browse page (parity-round-2 fix).**
  The original design fused home+browse into `/tv`, so clicking a library card only
  added an in-place `?libraryId=` filter chip — which read as "nothing happened"
  because cinema navigates from home `/` to a *distinct* route `/movies?libraryId=`
  (solid header + back button + library-name banner). Fix: `/tv` stays a pure hero
  landing (TvHero + Media Libraries + Continue Watching + Recently Added), and a NEW
  dedicated `src/app/(main)/tv/browse/page.tsx` mirrors `/movies` — a `Tabs` bar with
  **Shows / Favorites / Genres / People**, sort dropdown, a filter dropdown fed by
  `/api/tv/filters`, and the WebGL poster wall (the shared `PosterWall` got an
  `hrefBase` prop, default `/movies`, so TV passes `/tv`). `LibraryCard hrefBase` on the
  home now points at `/tv/browse`. **Header gotcha:** `isTvShowDetail = /^\/tv\/[^/]+$/`
  would ALSO match `/tv/browse`, so it's guarded with `pathname !== "/tv/browse"`; the
  header gains `isTvLibraryPage`/`isTvPersonFilmography` branches (keyed on
  `pathname === "/tv/browse"` + `libraryId`/`personId`) that render the SOLID
  back-arrow-to-`/tv` + library/person-name banner exactly like the cinema library page.
  The tv-person-name banner query hits `/api/tv/people/{id}` — NEVER the cinema
  `/api/people/{id}`. `/api/tv` gained `personId` (filmography) and `filter=favorites`
  branches to back the browse tabs.
- **Detail-page parity with movies.** The show detail page reuses the cinema building
  blocks, parameterized not forked: `StarRatingDialog` (reads `tvShowRatingDimensions`/
  `tvShowDimensionWeights` from `useUserPreferences`) writing to
  `PUT /api/tv/{id}/user-data`, plus a **per-episode** ★ on each episode row →
  `PUT /api/tv/episodes/{id}/user-data`; a three-dot menu → `TvShowMetadataEditor`
  (`components/tv/`, a fork of the movie editor that drops the single-runtime field and
  edits `country` as a plain string) + the shared `ImageEditorDialog` (`entityType="tvshow"`)
  + an **external-player** launch item (`POST /api/tv/episodes/{id}/play-external`) +
  delete-with-confirm. A Bookmarks section lists `GET /api/tv/{id}/bookmarks` via the
  shared `BookmarkCard` (`playHref`); **technical badges + a `MediaInfoDialog`** now
  render off the first episode's `GET /api/tv/episodes/{id}/media-info` (the dialog got
  an additive `apiBase` prop, default `/api/movies`, so TV passes `/api/tv/episodes`);
  and a **"more like this"** row pulls same-genre shows from `/api/tv?genre=`. **Cast is
  now favoritable** — the `/api/tv/[id]` GET leftJoins `user_tv_person_data` for per-cast
  `isFavorite`, and cards toggle via `PUT /api/tv/people/{id}/user-data`. (Show-level
  Media Info is *per-episode* by nature, hence sourced from an episode, not the show.)
- **Poster-morph entrance animation (parity-round-3).** Clicking a `ShowCard` now runs the
  same shared-element View Transition as movies — `show-card.tsx` calls
  `startPosterViewTransition`/`startDimNavigation` from `lib/view-transition.ts` on the
  `<Link onClick>` (guarding modifier/`defaultPrevented` clicks) and `ref`s its inner poster
  `<div>`; the detail hero's large poster carries `{...{ [POSTER_VT_ATTR]: "" }}` +
  `style={{ viewTransitionName: "movie-poster" }}` as the morph target. The helper is
  domain-agnostic — the VT name `"movie-poster"` is intentionally reused (only one detail
  page is ever mounted, so there's no collision), NOT a cinema-table reference. The "more
  like this" row passes `dimTransition` so detail→detail dips through black instead of
  double-morphing (identical to the movie detail page).
- **TV people sub-domain reaches parity.** `/tv/people/[id]` went from read-only to a
  favorite Heart + multi-dimension `StarRatingDialog` (reusing the cinema
  `personRatingDimensions` prefs — a person's rating dimensions are cross-domain user
  taste, correctly a *preference* not a domain table), backed by the new isolated
  `user_tv_person_data` table + `GET/PUT /api/tv/people/[id]/user-data`. The browse
  People tab lists `/api/tv/people`; a `/api/tv/people/hero-wall` powers its mosaic.
- **Global search includes TV.** `/api/search` gained SEPARATE `tvShows`/`tvEpisodes`/
  `tvPeople`/`tvBookmarks` result groups (never merged into the cinema arrays), rendered
  as their own sections in `search/page.tsx` linking into `/tv/*`.
- **Domain-aware Preferences (bodies split, not just the label — parity-round-3).**
  `preferences-sidebar.tsx` uses `useCurrentDomain()` to label the media group "TV" when in
  the TV domain, AND the three shared preference PAGE BODIES now render only the current
  domain's sections via the same hook (2-way split: `domain === "tv"` → TV sections; else →
  cinema movie/person sections). `card-badges` shows TV Show Card Badges vs Movie+Person
  Card Badges; `hero-mosaic` shows the TV Wall vs Movie Wall + People Wall; `ratings-bookmarks`
  (component `PersonalMetadataPage`) shows TV Show Rating Dimensions vs Movie+Person Rating
  Dimensions — while Bookmark Icons + Quick Bookmark Template + subtle-markers stay in BOTH
  (shared bookmarking infra for movie & episode bookmarks). **Invariant:** all hooks/queries
  still run unconditionally and every `handleSave` payload keeps ALL fields (hidden-domain
  values stay hydrated and are saved back untouched) — only the JSX is gated, so switching
  domains never wipes the other domain's prefs. Backing fields: `showTvShowRatingBadge`/
  `showTvResolutionBadge`; the TV Wall persists `tvHeroMosaicConfig` (filtered to
  `type==="tvshow"`, previewing `/api/tv/hero-wall`, which honors the config); `show-card.tsx`
  renders the rating badge when the pref is on + a `personalRating` is supplied. (The
  resolution badge is coded but TV cards carry no single per-title resolution, so it stays
  dark until a caller supplies dimensions — it never invents data.)

## Cross-domain safety (a hard rule)

**Cross-domain operations are a cardinal sin.** Cinema / TV / Photos / Music share ONE
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
- **Shared UI components must not hardcode one domain's routes.** `PersonCard` linked
  to `/people/{id}` and `LibraryCard` to `/movies?libraryId=` — reusing either in the TV
  domain sent a `tv_people`/`tvshow` id into a cinema route. A `tv_people` id hitting
  `/api/people/{id}` returned 404 `{error}`, which the cinema person page's `if (!person)`
  guard mistook for a valid person and crashed on `person.name[0]`. Fix: parameterize the
  shared card with an `hrefBase` (+ `readonly` to hide cinema-only edit/delete menus whose
  dialogs call `/api/people/*`), give TV its own `/tv/people/[id]` page + `/api/tv/people/[id]`
  route, and make both person pages require `person.name` before rendering (an `{error}`
  body has none). **When reusing a card across domains, thread the target route in as a
  prop — never let it default to the domain that happened to build it first.**
- **Per-domain counts must pick the right table.** `GET /api/libraries[/:id]`
  counted `movies` unconditionally, so photo/music libraries always showed `· 0`.
  Count per `type` via a `CASE` (movies / photo_items / music_tracks / tv_episodes —
  the tvshow branch counts episodes under the library's shows). The field is still
  aliased `movieCount` for consumers, but the query is domain-aware.
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

- **Global-scoped rows with no FK to the library must be pruned on delete.**
  `music_artists` is global (an artist spans libraries), so the FK cascade from
  `media_libraries` never removes it — deleting a music library left orphaned
  0-track artist rows. The `type === "music"` delete branch calls
  `pruneOrphanArtists()` (from `music/mutations.ts`) *after* the cascade, mirroring
  the movie branch's orphan-people cleanup. Any future global/shared table needs
  the same explicit sweep in each domain's delete path.
- **TV has its OWN orphan-people sweep, kept fully separate.** The `type === "tvshow"`
  delete branch (`api/libraries/[id]/route.ts`) prunes orphan `tv_people` (no remaining
  `tv_show_people`) + their `metadata/tv-people/` dirs — it queries ONLY the TV tables
  and is gated on `tvshow`, so deleting a TV library never touches cinema `people` and
  vice versa. Verified at runtime: a TV scan left cinema `people` count unchanged. When
  a domain has an isolated copy of a shared concept, give it a parallel gated sweep —
  do not widen the existing sweep.

## Demo Mode (seed + clear/factory-reset)

Fills all four domains on a fresh install so the product isn't a blank slate.

- **Assets are committed, not runtime-scanned in place.** `test-media/`,
  `test-tv-media/`, and `data/*` are ALL gitignored — a fresh machine has none of
  them. So demo content lives in a committed `demo-assets/` dir (un-ignored; ~58 MB),
  authored ONCE by `scripts/build-demo-assets.ts` (dev-only) from the dev's local test
  data. `scripts/package.ts` copies `demo-assets/` next to `server.js` so packaged
  installs seed offline. `getDemoAssetsDir()` / `getDemoDir()` in `src/lib/paths.ts`.
- **One placeholder video, copied per item.** The bundle ships NO per-item videos —
  just one ~235 KB `placeholder.mp4`. The seeder (`src/lib/demo/seed.ts`) copies it
  into every movie/episode slot at seed time (movie slot = `<movieDir>.mp4`; TV slots
  come from `manifest.json.tvEpisodes` since no episode videos are committed). Keeps
  git small; the placeholder is H.264/AAC so it direct-plays.
- **Seeder reuses the REAL scanner — never forks the write path.** It materializes
  `demo-assets/<domain>` → `{dataDir}/demo/<domain>`, then calls `scanLibrary(id)` per
  domain. Demo libs are created `jellyfinCompat=true` (so the scanner imports the
  bundled `<actor><thumb>` cast photos), `scraperEnabled=false`, `isDemo=true`.
- **NFO `<thumb>` paths MUST be rewritten at seed time.** Committed NFOs carry the dev
  machine's absolute actor-photo paths (`…\metadata\people\…`). The seeder rewrites the
  `…metadata/(people|tv-people)/…` tail onto THIS install's `getMetadataDir()` (after
  copying those photos there) — otherwise the scanner's jellyfin-compat photo import
  (`scanner/index.ts` `library.jellyfinCompat && fs.existsSync(actor.thumb)`) silently
  finds nothing.
- **Music is synthetic + license-safe.** `build-demo-assets.ts` generates ffmpeg sine
  tones (AAC/m4a) with embedded title/artist/album/track tags + a folder `cover.jpg`
  reusing MOVIE posters — no copyrighted audio or album art.
- **`is_demo` is the teardown allowlist (migration 0042).** `DELETE /api/setup/demo`
  selects libraries `WHERE is_demo = true` and reuses the per-library
  `DELETE /api/libraries/[id]` teardown (FK cascade + per-domain on-disk cleanup +
  orphan people/artist sweep — see Cross-domain safety), then `rm -rf {dataDir}/demo/`.
  `?factoryReset=true` also deletes the demo user (→ `count(users)===0` returns the app
  to the setup wizard). A real library added alongside the demo is never touched —
  verified. `POST /api/setup/demo` creates the `demo`/`demo` admin + seeds via SSE
  (guarded by the same first-run `count(users)===0` check as normal setup); the setup
  wizard forks to it after language selection.

## Backend review checklist

How this repo's backend was reviewed (2026-07-11) and the recurring failure shapes.
Re-run this per-dimension (four independent read-only reviewers, then self-verify
every High before touching code) when auditing the backend. The two highest-yield
categories: **client-controlled parameter → filesystem / process / SQL**, and
**concurrency of long-running stateful subsystems (scanner, transcode) + deletion
racing them.**

1. **Cross-domain** — see the hard-rule section above. Allowlist not blocklist;
   count per-domain table; gate destructive side-effects on server-side `type`;
   prune global-scoped rows (artists) on delete.
2. **API security** — auth coverage (which routes are reachable unauthenticated;
   the middleware is `src/proxy.ts` in Next 16, gating via `authorized()` in
   `auth.config.ts` — its `publicPaths` list + the stream regex are the whole
   allowlist); path traversal on any route that turns a **client-supplied** param
   into an `fs` path (DB-sourced paths are safe, client-sourced are not); command/
   arg injection (all ffmpeg/external-player spawns use arg arrays, no shell — keep
   it that way); SSRF (TMDB fetches are fixed-domain); SQL is fully Drizzle-
   parameterized. Known residual (deferred): most `settings`/`libraries`/mutation
   routes authorize on "any logged-in session", not `isAdmin` — fine for a single-
   admin install, revisit when a non-admin user exists.
3. **Robustness** — orphaned ffmpeg (client disconnect / shutdown / mid-stream),
   unbounded concurrent transcode sessions (**still uncapped** — deferred), races
   between session create/kill/seek, scanner concurrency (needs a server-side lock,
   not just a client ref), delete racing an in-flight scan, one corrupt file
   aborting a whole scan, `readFileSync` on a hot path blocking the event loop
   (**HLS segment serving still sync** — deferred).
4. **Database** — the migration cross-check is mandatory: every column in
   `schema.ts` on a base table (`users`/`media_libraries`/`movies` etc.) needs a
   matching idempotent `ALTER TABLE … ADD` in the `pending` array of
   `db/index.ts`, or a DB created before that column's base-CREATE crashes
   `no such column` on upgrade. Also: FK cascade completeness (+ `PRAGMA
   foreign_keys=ON`), indexes on hot WHERE/ORDER-BY/JOIN columns of large tables,
   UNIQUE constraints the upsert logic assumes.

**Fixes shipped from this review** (`574f5ec`, hardening only, no behavior change):
confined `/api/images/[...path]` to library-folders + data-dir roots (was an
authenticated arbitrary-file-read — `kubby.db`/`.env`); anchored the public stream
regex to exactly `/stream` so `/stream/decide` (spawns ffmpeg) needs auth;
server-side per-library scan lock (released in `finally`) + a library-still-exists
re-check before the destructive end-of-scan cleanup in all three scanners;
coalesced concurrent per-session seeks in the transcode manager; prune orphan
artists on music-library delete; 8 idempotent backfill ALTERs + migration catch now
logs non-benign failures instead of swallowing all; removed the plaintext-password
log in `setup/complete`.

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

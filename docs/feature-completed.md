# Completed Features / Work Log

Reverse-chronological. Detailed patterns live in the kubby skill
(`.claude/skills/kubby/`); this is a short ledger of shipped work.

## 2026-07-13 — Demo Mode: download assets on demand (drop installer bundling)

Bundling the demo pack into every installer was wrong — it bloats the download for
the majority who never use Demo Mode. Now the pack is fetched from a GitHub release
only when a user opts in.

- **Not bundled anymore.** Removed the `demo-assets/` copy step from
  `scripts/package.ts`. The raw `demo-assets/` tree stays committed as the dev
  **authoring source** (so a dev box still seeds with zero network); packaged installs
  no longer carry it.
- **Downloaded on demand.** New `src/lib/demo/fetch-assets.ts` `ensureDemoAssets()`
  resolves the tree: local committed tree → prior download cache
  (`{dataDir}/demo-assets`) → download `demo-assets.tar.gz` from the `demo-assets`
  GitHub release (override via `KUBBY_DEMO_ASSETS_URL`). Bounded by an overall deadline
  (`KUBBY_DEMO_DOWNLOAD_TIMEOUT_MS`, default 120s) **and** a 20s per-chunk stall guard,
  with a clear "download timed out" error. Runs BEFORE the demo user is created in the
  SSE route → a failed download leaves the DB pristine (no orphan account).
- **Zero-dependency extraction.** `src/lib/demo/targz.ts` — a built-in-`zlib` gunzip +
  hand-written tar reader (ustar + GNU-longname + PAX-path, path-traversal rejected), so
  packaged installs need no `tar` binary and no new npm dep. Round-trip-verified
  byte-for-byte against real `tar czf` output (incl. >100-char GNU-longname paths and
  trailing-dot dir names); the full 42 MB / 568-file pack extracts in ~1.2s. Also
  verified the download/cache-hit/timeout/404 lifecycle end-to-end over local HTTP.
- **Trimmed 30→15 movies** in `build-demo-assets.ts` (always keeps the 3 music-cover
  titles), which also drops their orphaned cast photos. Bundle 58→44 MB, tarball ~42 MB
  (art is already-compressed JPEG, so gzip barely helps — the movie count isn't the
  bulk). Added a pack step that emits `demo-assets.tar.gz` (gitignored) + the
  `gh release upload` hint.
- **Wizard/i18n.** New `download` SSE phase (MB progress bar); confirm dialog + demo card
  now state it downloads ~40 MB from GitHub and needs internet (en + zh).
- Publishing the `demo-assets` release asset is a one-time out-of-band step (pending).

## 2026-07-13 — Demo Mode (one-click populated install + clear/factory-reset)

A fresh install has no media (all `test-media/`/`data/*` is gitignored), so a
first-time user saw an empty product. Demo Mode fills all four domains from a
committed asset bundle.

- **Committed `demo-assets/` bundle** (~58 MB) authored once by
  `scripts/build-demo-assets.ts` from the dev's local test data: 30 movies + 8
  shows' NFO/posters/`.stills`, 18 reused photos, 3 synthetic-tone music albums,
  and only the cast photos referenced by NFOs (520 cinema + 78 TV). One 235 KB
  `placeholder.mp4` (no per-item videos committed) + a `manifest.json`.
- **Runtime seeder** `src/lib/demo/seed.ts` materializes the bundle into
  `{dataDir}/demo/`, copies the placeholder into every movie/episode slot,
  **rewrites NFO `<thumb>` actor-photo paths** to the runtime metadata dir, then
  drives the REAL `scanLibrary` per domain (no forked write path). Demo libs run
  `jellyfinCompat=true` (imports the bundled cast photos), `scraperEnabled=false`,
  and carry an `is_demo` flag (migration 0042).
- **Setup wizard** gains a fork after language: manual setup (unchanged) vs
  "Explore with demo content" → SSE progress screen → credentials screen
  (`demo`/`demo`). New `POST /api/setup/demo` (seed, SSE) + `DELETE` (clear /
  `?factoryReset=true`).
- **Dashboard "Demo Data" panel** (shown only when an `is_demo` lib exists): clear
  demo libraries (keeps account, reuses the per-library teardown) or factory reset
  (also removes the demo account → returns to first-run setup). Both key off the
  `is_demo` allowlist, so a real library added alongside the demo is never touched.
- ~~Bundled into packaged builds via a `scripts/package.ts` copy step.~~
  **Superseded same day** — see the 2026-07-13 download-on-demand entry above: the pack
  is no longer bundled (now downloaded from a GitHub release), and cinema was trimmed
  30→15 movies.

Verified end-to-end against an empty `KUBBY_DATA_DIR`: 4 demo libs, 30 movies (all
with media_streams → playable), 8 shows/14 episodes, 18 photos, 3 albums/12 tracks,
521 imported cast photos; clear keeps the account, factory reset empties users,
and a real non-demo library survives clear.

Also shipped a setup-wizard UX review (`docs/setup-wizard-ux-review.md`) — 9
findings (inverted eye-toggle, hardcoded English validation, inconsistent
library-type lists across 3 surfaces, no post-setup scan, etc.), not yet fixed.

## 2026-07-12 — Left-drawer domain switcher (orientation + always-available switching)

The user found it easy to lose track of which of the four domains they were in, and the
only way to switch was the header brand dropdown — which collapses into back-nav on
detail/library/search/preferences pages, leaving no switcher at all there. Fix: the
`NavSidebar` top group (previously a cinema-only `Home` item + a redundant single "All X"
media entry) is now a **domain list** — one row per existing domain (Cinema always;
TV/Photos/Music gated on the shared `useHas*Library()` hooks), the active one highlighted
+ checked via `useCurrentDomain()`, each linking to that domain's home. Since the drawer
opens on every page, this is the always-available switcher and doubles as the "you are
here" indicator. Reused the `nav.media` label + existing hooks — no new i18n keys, no
schema/API/table-count change. tsc exit 0; verified in-browser (Cinema→TV switch,
active highlight follows domain, cinema-only Metadata group hides in TV). Detail in the
kubby skill (feature-patterns.md → Domain switcher; SKILL.md → Domain separation).

## 2026-07-12 — TV parity round 3: detail-page entrance animation + preferences domain-separation

Two residual gaps the user flagged after round 2: (1) TV detail pages didn't replay the
polished open animation movies have, and (2) the shared Preferences pages stacked TV + movie
sections together (only the sidebar *label* was domain-aware) — confusing, and blocking a
future independent TV config. Shipped via two file-disjoint opus executors; tsc clean +
verified in-browser. Detail in the kubby skill (feature-patterns.md → TV series domain →
poster-morph entrance animation / domain-aware Preferences).

- **Poster-morph entrance animation for TV.** `ShowCard` now runs the same shared-element
  View Transition as movies — reusing the domain-agnostic `startPosterViewTransition` /
  `startDimNavigation` helpers (`lib/view-transition.ts`, VT name `"movie-poster"`, safe to
  share since only one detail page mounts at a time). `show-card.tsx` gained the `<Link
  onClick>` guard + `posterRef`; the detail hero's large poster carries `POSTER_VT_ATTR` +
  `viewTransitionName`; the "more like this" row passes `dimTransition` (detail→detail dips
  to black). No new helper written, no backend touched.
- **Preferences page bodies are now domain-split.** `card-badges`, `hero-mosaic`, and
  `ratings-bookmarks` render only the current domain's sections via `useCurrentDomain()`
  (`domain === "tv"` → TV sections; else → cinema movie/person). Bookmark Icons + Quick
  Bookmark Template stay in both (shared infra). Invariant preserved: all hooks/queries run
  unconditionally and every save payload keeps ALL fields — hidden-domain prefs stay
  hydrated and are saved back untouched, so switching domains never wipes the other's config.
- **No schema / i18n / table-count change** — reused existing section headers and prefs
  fields; purely presentational + navigation-UX. tsc exit 0; console clean; cross-domain
  isolation intact (no DB/API touched).

## 2026-07-12 — TV↔Cinema full feature-gap closure (parity round 2)

The first TV parity pass left ~12 gaps (re-audited with 3 parallel explorers). The user
asked to close ALL of them plus the WebGL poster wall. Shipped via the multi-model
workflow (Fable orchestrator + opus executors, file-disjoint waves; tsc clean +
cross-domain isolation verified after each wave). Full detail in the kubby skill
(architecture.md → TV endpoints / `user_tv_person_data`; feature-patterns.md → TV series
domain).

- **Dedicated browse route (the #1 complaint).** Root cause: TV fused home+browse into
  one `/tv` route, so clicking a library card only added an in-place `?libraryId=` chip —
  whereas cinema navigates from `/` to a *distinct* `/movies?libraryId=` (solid header +
  back + library-name banner). Fix: `/tv` is now a pure hero landing; NEW
  `src/app/(main)/tv/browse/page.tsx` mirrors `/movies` with **Shows / Favorites /
  Genres / People** tabs, sort, a filter dropdown (`/api/tv/filters`), and the WebGL
  poster wall (`PosterWall` got an `hrefBase` prop). `app-header.tsx` gained
  `isTvLibraryPage`/`isTvPersonFilmography` solid-header banner branches (fixing the
  `isTvShowDetail` regex that also matched `/tv/browse`); `/api/tv` gained `personId`
  filmography + `filter=favorites` branches.
- **TV people sub-domain.** `/tv/people/[id]` now has favorite + multi-dimension rating
  (reusing cinema `personRatingDimensions` prefs) backed by the NEW isolated
  `user_tv_person_data` table (migration 0041) + `GET/PUT /api/tv/people/[id]/user-data`;
  new `/api/tv/people` list + `/api/tv/people/hero-wall`; browse People tab; and cast
  cards on the show detail page are now favoritable (leftJoin in `/api/tv/[id]` GET).
- **Global search includes TV.** `/api/search` gained separate `tvShows`/`tvEpisodes`/
  `tvPeople`/`tvBookmarks` groups (never merged into cinema arrays), rendered in the
  search page linking into `/tv/*`.
- **Detail-page extras.** Technical badges + `MediaInfoDialog` (from the first episode's
  new `/api/tv/episodes/[id]/media-info` (+`/raw`); dialog got an additive `apiBase`
  prop), external-player launch (`/api/tv/episodes/[id]/play-external`), a "more like
  this" same-genre row, and per-episode ★ ratings.
- **Domain-aware Preferences + TV badges + TV home wall.** `preferences-sidebar` labels
  the media group "TV" via `useCurrentDomain()`; new TV Show Card Badges section
  (`showTvShowRatingBadge`/`showTvResolutionBadge`) + TV Wall in hero-mosaic
  (`tvHeroMosaicConfig`, honored by `/api/tv/hero-wall`); `show-card` renders the rating
  badge. New browse/genres endpoints: `/api/tv/genres`, `/api/tv/filters`.
- **Schema:** migration 0041 adds `user_tv_person_data` (peer of `user_person_data`, FK →
  `tv_people`) + `show_tv_show_rating_badge`/`show_tv_resolution_badge`/
  `tv_hero_mosaic_config` on `user_preferences` (schema.ts + index.ts both updated). Table
  count 31→32. i18n: new `tv`/`search`/`preferences`/`cardBadges`/`heroMosaic` keys
  (en+zh parity, still 22 namespaces).
- **Isolation held:** every new TV route allowlists `tv_*` tables only (grep-verified —
  cinema-table mentions appear only in isolation-documenting comments); TV people reuse
  the cinema *person-rating-dimension preference* (user taste, not a domain table) but
  their favorites/ratings live in the isolated `user_tv_person_data`.

## 2026-07-12 — TV series domain (fourth domain: 🎬 Cinema → 📺 TV → 📷 Photos → 🎵 Music)

Added a full TV/series domain (美剧 + 动漫) mirroring the movie skeleton but kept as a
separate, isolated domain. Built via the multi-model workflow (Fable orchestrator +
opus executors, 12 tasks). Full detail in the kubby skill (architecture.md → Domains /
TV domain tables; feature-patterns.md → TV series domain).

- **Data model (9 tables, migration 0040)**: `tv_shows` → `tv_seasons` → `tv_episodes`
  (redundant `show_id` for cheap joins; season 0 = Specials; `episode_number_end` for
  multi-episode files; `absolute_number` reserved for anime, not parsed in v1),
  `tv_media_streams`, isolated `tv_people`/`tv_show_people`, `user_episode_data`
  (per-episode progress), `user_tv_show_data` (show favorite/rating + Next Up ordering),
  `tv_episode_bookmarks`. Both `schema.ts` and the `db/index.ts` pending array updated.
- **Scanner** (`scanner/tv-scanner.ts`): three-level `Show (Year)/Season NN/Show SxxExx`
  parse with year-misread + resolution-token guards, `scrapeTvShow` (TMDB `/tv` →
  per-season episode metadata + stills), `<tvshow>`/`<episodedetails>` NFO parse/write,
  per-episode ffprobe, incremental skip, FK-safe cleanup.
- **Reused, not forked**: the transcode pipeline is domain-agnostic; the video player is
  shared by adding a `basePath` option to `usePlaybackSession`/`useProgressSave`
  (`/api/tv/episodes/{id}` vs `/api/movies/{id}`) — the movie player behaves identically.
- **API** `/api/tv/*` (+ `/api/tv/episodes/*`): list/next-up/recently-added, show detail
  with season-grouped episodes + live-aggregated watch state, episode stream/decide
  (iOS-HEVC block preserved)/keyframes/frame/bookmarks/user-data. Raw episode stream
  added to the `auth.config.ts` public allowlist.
- **Pages** `/tv`: home (Next Up + Recently Added + all-shows grid), show detail (hero +
  season selector + episode list + favorite + cast), episode player (shared player +
  auto-play-next). Domain wired into all 7 switch points (header dropdown, sidebar,
  bottom tabs, cookie sync, root redirect, `useCurrentDomain`, `useHasTvLibrary`),
  library allowlist (count CASE, stats, tvshow-only orphan-people sweep), TV rating
  dimensions, and i18n (`nav.tv` + new `tv` namespace, en/zh).
- **Cross-domain isolation held**: TV cast lives in `tv_people` (`metadata/tv-people/`),
  never cinema `people`; TV library delete has its own gated orphan sweep.
- **Verified end-to-end in-browser** (chrome-devtools, real TMDB): generated a synthetic
  test library (Breaking Bad / Attack on Titan / Sherlock incl. Specials), scanned 3
  shows / 9 episodes / 19 cast — cinema `people` count unchanged (579); `/tv`, show
  detail, and episode playback (S01E01 mkv → REMUX, correct burned-in decide label) all
  render/play. Found + fixed one runtime bug tsc missed: `tv_shows.country` is a plain
  string, not JSON (detail route was `JSON.parse`-ing it → 500). tsc clean throughout.
- **Follow-up (same day)**: (1) fixed a cross-domain crash — TV cast rendered via
  `PersonCard`'s default `/people/{id}` href, so clicking an actor hit the cinema
  `/api/people` (404 `{error}`) and the person page crashed on `person.name[0]`. Added an
  isolated `/tv/people/[id]` page + `/api/tv/people/[id]` route (queries `tv_people` only,
  read-only), parameterized `PersonCard` with `hrefBase`/`readonly`, and hardened both
  person pages to require `person.name`. (2) Rebuilt the `/tv` home to mirror the cinema
  home — animated `HeroMosaic` poster wall (`<TvHero>` + `/api/tv/hero-wall`) + Media
  Libraries row (`LibraryCard` parameterized with `hrefBase`/`countLabel`, TV-only
  allowlist) + Next Up / Recently Added + all-shows grid. (3) Extended the test generator
  to 8 shows (added Game of Thrones / Stranger Things / The Office / Friends / Chernobyl)
  so the wall (≥8 posters) renders; rescanned — 8 shows, cinema `people` still 579.
- **TV↔movie feature-gap closure (same day)**: audited the TV domain vs cinema (4
  parallel read-only explorers) then shipped Tier 1 + Tier 2 parity via 4 opus
  executors (file-disjoint, verified in-browser). (1) **Nav blends** — `/tv`, `/tv/{id}`,
  `/tv/people/{id}` join the transparent-header allowlist (hero bleeds up, no solid
  bar); TV detail pages get back/home nav (home → `/tv`); the TV episode player is now
  hidden by the header early-return (was a real bug). (2) **Whole-page library/genre
  filter** — clicking a TV library card (or a genre/studio link) narrows the hero wall +
  Continue Watching + Recently Added + grid + count; `/api/tv` + `/api/tv/hero-wall`
  gained `genre`/`studio`/`tag` (and next-up gained `libraryId`); an in-page "Viewing … ✕"
  chip is the affordance. (3) **Detail-page parity** — personal multi-dimension rating
  editor (`StarRatingDialog` + the pre-existing `tvShowRatingDimensions` prefs, which had
  no consumer), a three-dot menu (edit metadata via new `TvShowMetadataEditor`, edit
  images via `ImageEditorDialog` extended with `entityType="tvshow"`, delete-with-confirm),
  genre/studio filter links, and a Bookmarks section aggregating episode bookmarks
  (`GET /api/tv/[id]/bookmarks`) through a generalized `BookmarkCard` (`playHref`). New
  backend: `PUT /api/tv/[id]` (edit + cast into `tv_people` only + NFO writeback),
  `POST/DELETE /api/tv/[id]/images`. Deferred by design: show-level Media Info (per-file,
  lives on the player) and cast-favorite (no `user_tv_person_data` table). tsc clean;
  isolation held (no cinema tables touched from any TV route).

## 2026-07-11 — Music: split symbol-joined artist names

Scanner used to treat a collaboration tag ("周杰伦&林迈可") as ONE artist, which
also blocked same-title duet/solo tracks from grouping into one album (grouping
keys on shared artist id).

- **`lib/music/artist-split.ts` → `splitArtistNames()`** — language-aware split:
  `、` always; `&`/`＆` when a CJK char is adjacent on EITHER side; `-`/`－` only
  when CJK on BOTH sides. Western band names preserved ("AC/DC", "Simon &
  Garfunkel", "Jay-Z", "Earth, Wind & Fire"). NUL sentinel so spaces in names
  survive. 17 unit cases pass.
- **Scanner** derives artists via the splitter (dedupe, order-stable) → album
  grouping then collapses duet+solo tracks naturally (no grouping-algo change).
- **Backfill** (`backfillArtistSplits`, runs at scan start, idempotent): splits
  legacy combined-artist ROWS, rewires their track/album joins to the parts,
  deletes the combined row, then merges same-title albums that now share an artist
  (fixed-point, gap-fills cover/year). Old libraries self-heal on next rescan.
- Verified via an end-to-end temp-DB scan test (8 assertions: split, merge, track
  re-parent, join rewire, cover gap-fill) + tsc + eslint clean.

## 2026-07-11 — QQ-Music-style Now Playing overlay

Redesigned the full-screen music Now Playing overlay to mimic QQ Music. Pattern
detail in the skill (`references/feature-patterns.md` → Music library + global
player). Orchestrated as 3 executor subagents (Web Audio / vinyl+lyrics / overlay
restructure), each verified + a concurrency fix folded in by the orchestrator.

- **Rotating vinyl disc** (`vinyl-disc.tsx`) — simple dark grooved disc, large
  circular cover label (~64% diameter, per feedback the vinyl ring was too heavy),
  spins via `.music-vinyl-spin`, freezes on pause, reduced-motion aware.
- **Real audio spectrum** (`audio-spectrum.tsx` + `ensureAnalyser()` in the player
  provider) — Web Audio `AnalyserNode` on the singleton `<audio>`, canvas rAF bars.
  Safe-sequencing so audio is never silenced (resume-first, one-shot source, never
  disconnect, **in-flight-promise-memoized** build so the two concurrent spectrum
  mounts + StrictMode don't race a second `createMediaElementSource`).
- **Left-aligned lyrics** (`LyricsView align="left"`), **left-aligned** in the
  desktop right pane; self-scroll centering untouched.
- **Bottom transport bar** — favorite heart (own query/mutation) + mini info ·
  spectrum + transport + long seek · volume popover + queue-drawer toggle.
- **Queue drawer** — right-anchored, frosted glass mirroring the homepage
  `NavSidebar` drawer (dimming blur scrim + translucent panel + inset edge highlight).
- **Adaptive ambient glow** — background halo + spectrum tint follow the album
  cover's dominant colour via the existing `extractAmbientColor` helper.

Verified in-browser (chrome-devtools MCP): vinyl spin/freeze, spectrum reacts to
audio + survives overlay close/reopen, **audio keeps playing after closing the
overlay** (the key regression), adaptive glow matches cover, drawer glass + scrim
click-to-close.

## 2026-07-11 — Backend review + hardening (`574f5ec`)

Four-dimension read-only review (cross-domain / API security / robustness / DB) via
parallel subagents, each High self-verified before fixing. Methodology + findings
recorded in the skill (`references/feature-patterns.md` → Backend review checklist).

Shipped (hardening only, no behavior change for existing libraries / playback):
- Confined `/api/images/[...path]` to library-folder + data-dir roots (was an
  authenticated arbitrary-file-read of `kubby.db`/`.env`/keys).
- Anchored the public stream regex to exactly `/stream` so `/stream/decide` (spawns
  ffmpeg) is no longer reachable unauthenticated.
- Server-side per-library scan lock (released in `finally`) + library-still-exists
  re-check before the destructive end-of-scan cleanup in all three scanners.
- Coalesced concurrent per-session seeks in the transcode manager (no duplicate
  ffmpeg on rapid scrubbing).
- Prune orphan `music_artists` on music-library delete (global table, no FK cascade).
- 8 idempotent backfill ALTERs; migration catch logs non-benign failures instead of
  swallowing all; removed plaintext-password log in `setup/complete`.

Deferred (面广 / 需策略, not done this pass): admin-vs-user authorization layer,
transcode session cap, streaming HLS segments instead of `readFileSync`.

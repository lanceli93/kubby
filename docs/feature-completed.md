# Completed Features / Work Log

Reverse-chronological. Detailed patterns live in the kubby skill
(`.claude/skills/kubby/`); this is a short ledger of shipped work.

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

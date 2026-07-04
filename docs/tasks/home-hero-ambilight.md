# Home Page Visual Upgrade — "Now Showing" Hero + Ambilight

Design intent: bring the projection room to the home page. A full-bleed "Now
Showing" hero at top (first continue-watching item, fallback most recent), whose
light dissolves into the page; an ambient color field behind the content rows
that slowly shifts toward the poster you hover. Typography mirrors the poster
wall's caption language (boxless, tracking-wide, dot-separated meta, bordered
resolution chip).

## Task A — HomeHero + page restructure (executor, model: opus)

- [x] `src/components/home/home-hero.tsx` (new): full-bleed hero
  - Acceptance: home page shows a cinematic hero for continueWatching[0]
    (fallback recentlyAdded[0] with fanart); Ken Burns drift on the image only;
    caption-style title/meta/actions; Resume button with progress line;
    Details button; whole hero links to detail page.
- [x] `src/components/layout/app-header.tsx`: home (`/`) header becomes
  absolute + top gradient scrim (like detail pages), so the hero bleeds to the
  viewport top. Other routes unchanged.
- [x] `src/app/(main)/page.tsx`: tabs become floating glass pills (top center,
  poster-wall pill language); hero sits above rows inside the scroll container;
  rows rise into the hero's bottom dissolve (`-mt-*`, `relative z-10`);
  empty-library case gets `pt-14` and no hero; favorites tab content `pt-14`.
- [x] i18n `src/i18n/messages/{en,zh}.json` home ns: `heroResume` (Resume /
  继续播放), `heroPlay` (Play / 播放), `heroDetails` (Details / 详情).
- [x] `npx tsc --noEmit` passes.

## Task B — Ambilight ambient field (executor, model: opus)

- [x] `src/lib/ambient-color.ts` (new): extract average color from a
  `posterBlur` data URL via canvas, clamp S/L for a cinema-safe hue, cache.
- [x] `src/components/home/ambient-field.tsx` (new): provider + fixed-position
  radial glow layers behind home content; exponential-smoothing color
  transitions (rAF only while animating); slow breathing; `pointer-events-none`;
  reduced-motion → static.
- [x] `src/app/(main)/page.tsx`: hero sets the base ambient color; hovering any
  movie card (rows wrapped, MovieCard untouched) retargets the ambient color.
- [x] `npx tsc --noEmit` passes.

## Verify (orchestrator)

- [ ] Visual check in running app (screenshot) — hero, pills, ambient hover.
- [ ] `npx tsc --noEmit` clean.

## Round 2 — carousel rework (user feedback)

The single-image hero read as a flat dark backdrop ("平庸/没有呼吸感/按钮不好看").
Reworked into a Plex/Apple TV+ hybrid carousel:

- **Carousel**: `HomeHero` now takes an `items` pool (up to 5, deduped by id —
  `continueWatching.slice(0,3)` then `recentlyAdded` with fanart). Auto-advances
  every 8s via a self-rescheduling `setTimeout`; skipped for single item,
  reduced motion, or hidden tab (visibilitychange pauses/resumes). Backdrops
  cross-fade (all slides mounted, `transition-opacity duration-[900ms]`), Ken
  Burns preserved.
- **Floating poster card** (desktop, right side): `w-[168px] lg:w-[200px]`
  aspect-2/3 poster wrapped in `TiltCard` — the "breathing" 3D element. Links to
  detail, shows a progress bar on its bottom edge for in-progress items.
- **White primary button**: filled white pill / black text play button (industry
  standard); the stray progress underline inside the old button was removed.
  Secondary is a plain translucent bordered pill (no backdrop-blur, transform-safe).
- **Overview line**: two-line clamped synopsis under the title (needed adding
  `overview` to the continue-watching API select — recently-added already had it).
- **Slide indicators**: bottom-center bars, active bar fills 0→100% over 8s via a
  new `heroProgress` keyframe (`.animate-hero-progress`), clickable to jump.
- **Per-slide ambient**: the hero itself now sets the ambient base color from the
  active slide's `posterBlur` on each rotation — `AmbientBaseFromHero` in
  `page.tsx` was deleted and its job absorbed into the hero.

## Round 3 — Netflix-style animated mosaic wall

Rounds 1-2 (single fanart backdrop, then cross-fade carousel) both read as flat.
Reference: Netflix's login-page tilted poster mosaic. Our version is animated and
built from the library's own posters — a slowly drifting, non-interactive wall
that showcases library richness.

- **New `src/components/home/hero-mosaic.tsx`** — `HeroMosaic({ movies })` renders
  an oversized tilted plane (`absolute -inset-[25%]`,
  `[transform:perspective(1400px)_rotateX(10deg)_rotateZ(-8deg)_scale(1.28)]`,
  origin center — the oversize hides empty corners after rotation). 8 fixed
  columns (`flex-1 min-w-0 flex flex-col gap-3 md:gap-4`), each with its card stack
  duplicated back-to-back for a seamless `translateY(0 → -50%)` loop. Cards are
  round-robined from the pool (~5-6 per column, adjacent-dupe avoidance); every 3rd
  card with fanart is a landscape `aspect-video` tile, the rest `aspect-[2/3]`.
  Tiles: `rounded-md ring-1 ring-white/10` + `next/image` fill,
  `resolveImageSrc(img, 300)`, `sizes="220px"`, `loading="lazy"`, `alt=""`.
  Root is `aria-hidden pointer-events-none absolute inset-0 overflow-hidden` with a
  `bg-black/55` tint above the plane. Below 8 usable movies → returns null.
- **Drift**: new `mosaicDrift` keyframes + `.animate-mosaic-drift`
  (`animation: mosaicDrift var(--drift-dur, 80s) linear infinite`) in globals.css.
  Per column: inline `--drift-dur` from `[95,70,110,80,125,75,100,88]`s, odd columns
  `animation-direction: reverse`, `will-change: transform`,
  `motion-reduce:[animation-play-state:paused]` (static wall under reduced motion).
- **home-hero.tsx**: new `wallMovies: MosaicMovie[]` prop. Backdrop layer is the
  mosaic when ≥8 usable movies, else a single non-crossfade `HeroBackdrop` of the
  active slide (`key={id}` remount + `animate-fade-in`; Ken Burns dropped from the
  fallback). Removed the cross-fade multi-slide stack and the right floating
  `TiltCard` poster column (+ its import). Stacking: mosaic z-0
  (pointer-events-none) → whole-hero Link z-[1] (receives clicks) → gradient scrims
  z-[1] (pointer-events-none) → content z-[2] → indicators z-20. Hero height raised
  to `h-[52vh] min-h-[380px] md:h-[64vh] md:min-h-[480px]`.
- **page.tsx**: new `["movies","hero-wall"]` query (`?sort=dateAdded&limit=60`),
  passed as `wallMovies` to `HomeHero`.

## Round 4 — wall-driven spotlight sync

The wall drifted independently of the "Now Showing" block — two disconnected
rhythms. Round 4 inverts the dependency so **the wall drives the hero**: one tile
is spotlit at a time, and the text/buttons/ambient all follow that movie. This
guarantees the lit tile is always the one on screen.

- **Architecture inversion**: `HeroMosaic` now owns the 8s clock and reports the
  featured movie up via `onFeature(movie)`. `HomeHero` no longer runs its carousel
  timer in wall mode; it just displays whatever the wall reports. The old items
  carousel + slide indicators survive only as the fallback when the wall can't
  render (`usableWallCount(wallMovies) < 8`).
- **hero-mosaic.tsx**: `MosaicMovie` gained `posterBlur?`. New props `onFeature?`
  and `featuredEnabled?` (default true when `onFeature` given). New exported helper
  `usableWallCount(movies)` so callers decide wall-vs-fallback without duplicating
  the poster/fanart predicate.
  - **Per-card scrim** replaces the global `bg-black/55` tint: each tile carries an
    inner `bg-black/55` scrim (`opacity-100` normally, `opacity-0 duration-700`
    when lit) so a single tile can shine through the darkened wall.
  - **Lit look** mirrors movie-card's hover ambilight: scrim fades (700ms), a
    blurred copy of the same poster (`scale-110 blur-2xl opacity-70 animate-fade-in`)
    blooms behind (card root `overflow-visible`, image box keeps
    `overflow-hidden rounded-md ring-1`), ring brightens to `ring-2 ring-white/40`,
    the tile scales to `scale-[1.05]` and gets `z-10` so the glow overlaps neighbors.
    Tiles carry `data-tile="{col}:{i}"` (per-render-instance) + `data-movie-id`; only
    the one lit instance lights, its duplicated loop twin stays dark.
  - **Spotlight zone**: a self-rescheduling `setTimeout` (8000ms; first pick ~400ms
    after mount) reads each `[data-tile]` rect and keeps tiles whose center is inside
    the root, right of `rect.left + 45%` width, and between 12%–70% of height (visible,
    beside the left text block, above the bottom dissolve). It excludes the current
    featured movie id, then picks the tile nearest the spotlight point
    (`rect.left + 66%` width, `rect.top + 42%` height); falls back to nearest-without-
    exclusion if the filter empties. Paused while `document.hidden` (visibilitychange
    re-arms); reduced motion fires the initial pick once and never rotates. `onFeature`
    is held in a ref so the timer effect stays stable.
- **home-hero.tsx**: `wallMode = usableWallCount(wallMovies) >= 8`. New `featured`
  state set by `handleFeature`. A `byId` map (wall movies as HeroMovie-compatible,
  then hero items win with continue-watching enrichment) resolves the displayed
  entry: in wall mode the featured movie (enriched if it's also a hero item), else
  today's default before the first pick; in fallback mode the carousel `active`
  unchanged. `scheduleAdvance` early-returns in wall mode and indicators are not
  rendered there. Ambient effect keys off the displayed movie's `posterBlur`.
- **One-clock sync**: text re-fade (`key={id}` animate-fade-in), scrim fade (700ms),
  glow fade-in (400ms) and ambient ease (τ 600ms) all trigger from the same
  `onFeature` tick — no second timer. Text block stays absolutely positioned, so a
  length change causes no layout shift.
- **page.tsx**: hero render gate + rows-container `pt` conditional now key on
  `heroItems.length > 0 || wallMovies.length > 0`, so the hero renders (and the wall
  can drive it) even when there are no continue-watching / recently-added hero items.

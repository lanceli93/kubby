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

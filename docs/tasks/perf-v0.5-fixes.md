# Perf v0.5 fixes — task checklist

Source: `docs/performance-analysis-v0.5.md` (with corrections: port 8665 IS production;
all trace numbers are production numbers; P0-B withdrawn — the `next dev` process the
report found was the :3000 dev instance, not 8665).

Root cause of P0-A confirmed: installed app has `sharp@0.34.5` but
`@img/sharp-win32-x64@0.35.3` — `scripts/package.ts` `getNpmTarballUrl()` downloads
`/latest` instead of the version pinned in sharp's `optionalDependencies`. The 0.35.x
native binary loads but its `format()` shape mismatches the 0.34.5 JS wrapper →
`TypeError … reading 'output'` → swallowed by `getSharp()` catch → originals served.

Hard constraint for every task: **rendered result must stay pixel-identical.**

- [x] **A — package.ts: pin @img packages to sharp's optionalDependencies version**
      (`scripts/package.ts` swapNativeModules/getNpmTarballUrl/isSharpPkgComplete).
      Acceptance: packaged output installs @img pkgs at the exact version sharp pins;
      wrong-version existing pkg is detected and replaced; win32 doesn't download a
      separate libvips pkg that sharp doesn't list.
- [x] **B — /api/images: log sharp load failure + disk cache for resized output**
      (`src/app/api/images/[...path]/route.ts`, `src/lib/paths.ts`).
      Acceptance: sharp import failure logged once with real error; resize hits are
      served from `KUBBY_DATA_DIR/cache/images/` keyed by path|version|w|q as .webp.
- [x] **C — detail page: pass width to resolveImageSrc for hero/poster/disc images**
      (`src/app/(main)/movies/[id]/page.tsx:371,411,422,754,763`).
      Acceptance: fanart/poster/disc requests carry sensible `w`; layout unchanged.
- [x] **D — TiltCard: will-change on demand instead of resident**
      (`src/components/ui/tilt-card.tsx:170`).
      Acceptance: will-change only present during hover/tilt interaction; tilt visuals
      unchanged.
- [x] **E — LCP: priority/fetchpriority for first visible poster cards**
      (`src/components/movie/movie-card.tsx:141-149` + library grid call site).
      Acceptance: first ~8-10 above-the-fold cards load eagerly with high priority;
      the rest stay lazy; no layout change.

Deferred (re-measure after the above land): P3 forced reflow (ScrollRow/hero rect),
P5 data-layer scale items.

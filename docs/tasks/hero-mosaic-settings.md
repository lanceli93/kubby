# Hero Mosaic Wall Settings — task checklist

Feature: user-configurable home hero poster mosaic (columns, style, angle,
per-library ratio, year/resolution filters) with live preview, as a new
Preferences item.

Config shape (shared): `src/lib/hero-mosaic-config.ts`
`HeroMosaicConfig = { columnCount: 8..24 (default 16), style: "poster"|"fanart"|"both" (default "both"), angle: "flat"|"gentle"|"classic"|"steep"|"reverse" (default "classic"), libraryWeights: Record<libraryId, weight>=({} = proportional random, 0 = exclude), yearFrom: number|null, yearTo: number|null, minWidth: number|null }`

- [x] **T1 — Config plumbing (schema + API + hook).**
      New `src/lib/hero-mosaic-config.ts` (types, DEFAULT, MOSAIC_ANGLES map,
      normalize fn). `hero_mosaic_config` TEXT column: schema.ts + migration
      entry in db/index.ts `pending` array. personal-metadata GET/PUT
      passthrough (normalized). `UserPreferences` interface gains
      `heroMosaicConfig`.
      Accept: `npx tsc --noEmit` passes; PUT then GET round-trips the config;
      GET returns defaults when column NULL.
- [x] **T2 — `/api/movies/hero-wall` endpoint.**
      Weighted per-library random sampling + year/minWidth/style filters, reads
      saved config, query-param overrides for preview. Response items match the
      home Movie shape (same fields as /api/movies list).
      Accept: `npx tsc --noEmit` passes; no params → 60 random movies honoring
      saved config; params override; weights respected with top-up when a
      library runs short.
- [x] **T3 — Configurable HeroMosaic + home wiring.**
      HeroMosaic accepts config (columnCount, style, angle via inline-style
      transform, per-style column fill formula), usableWallCount style-aware;
      home page fetches /api/movies/hero-wall and passes prefs config through
      HomeHero.
      Accept: `npx tsc --noEmit` + `npm run build` pass; default config renders
      identically to today (16 cols, classic transform, paired tiles).
- [x] **T4 — Preferences page + sidebar + i18n.**
      `/preferences/hero-mosaic` page with live HeroMosaic preview (driven by
      draft config + hero-wall preview fetch), column slider, style + angle
      pickers, library weight sliders with % readout, year range, min
      resolution select, save via personal-metadata PUT; sidebar item; en/zh
      messages.
      Accept: `npx tsc --noEmit` + `npm run build` pass; preview reacts to all
      draft changes without saving; save persists and home reflects it.

## Round 2 — user feedback fixes

- [x] **R1 — Spotlight correctness + full-pool coverage.**
      Resolve the featured movie from the live DOM (`data-movie-id` + fresh
      ref maps) instead of a stale closure map; effect re-arms on config
      change. Widen the eligible zone to nearly the whole wall (keep text
      block + extreme edge exclusions). Prefer movies not yet featured this
      session (reset when exhausted).
      Accept: `npx tsc --noEmit` passes; lit tile always matches the caption
      after a saved column-count change; distinct featured movies over time
      approach the whole pool.
- [x] **R2 — Horizontal flow mode.**
      `flow: "vertical"|"horizontal"` in HeroMosaicConfig (JSON only, no
      migration). Horizontal = rows drifting via translateX(-50%) seamless
      loop, alternating directions, pair kept adjacent; new keyframe in
      globals.css. Preferences UI segmented control + i18n; flow NOT in
      preview/home queryKeys (client-only re-render).
      Accept: `npx tsc --noEmit` + `npm run build` pass; default vertical
      renders as today; horizontal drifts sideways with seamless loop.

# People Hero Wall — 演员马赛克墙首页 Tab

Feature: a third tab on the home page ("People" / 演员) showing a full-page animated
mosaic wall of people images (photo + own fanart + gallery), with the same random
spotlight + caption as the movie wall. Clicking goes to `/people/[id]`. Config lives
in Preferences → Home Poster Wall as a new "People Wall" section.

Eligibility rule: a person MUST have `photoPath` (their poster) to enter the wall.
No poster → excluded entirely (their fanart/gallery don't appear either).

## Task A — Backend foundation (config lib, schema, prefs API, hero-wall API, i18n)

- [x] `src/lib/people-mosaic-config.ts`: `PeopleMosaicConfig` type + `DEFAULT_PEOPLE_MOSAIC_CONFIG`
      + `normalizePeopleMosaicConfig()` (mirror `hero-mosaic-config.ts`, reuse `MosaicAngle`/`MosaicFlow`).
      Fields: `columnCount` (8–24, default 16), `angle` (default "classic"), `flow` (default
      "vertical"), `includeFanart` (bool, default true), `includeGallery` (bool, default true),
      `galleryCount` (0–10 per person, default 3), `personTypes` (subset of
      actor/director/writer/producer; `[]` = all; default `["actor"]`), `favoritesOnly`
      (bool, default false).
      Acceptance: normalize() never throws, clamps all fields, unknown junk → defaults.
- [x] Schema: `userPreferences.peopleMosaicConfig` = `text("people_mosaic_config")` in
      `src/lib/db/schema.ts` **AND** matching `ALTER TABLE user_preferences ADD people_mosaic_config text`
      in the `pending` migration array in `src/lib/db/index.ts` (BOTH required — see CLAUDE.md pitfall).
      Acceptance: both edits present; existing DB starts without error.
- [x] `/api/settings/personal-metadata` GET returns `peopleMosaicConfig` (normalized; default
      when row/column empty), PUT persists it (normalize before JSON.stringify) — mirror the
      `heroMosaicConfig` handling exactly. `use-user-preferences.ts` adds the typed field.
      Acceptance: GET always returns a valid config object; PUT round-trips.
- [x] `GET /api/people/hero-wall` (`src/app/api/people/hero-wall/route.ts`): auth-gated pool
      endpoint mirroring `/api/movies/hero-wall`. Loads saved `peopleMosaicConfig`, applies
      query-param overrides (`includeFanart`, `includeGallery`, `galleryCount`, `types` CSV,
      `favoritesOnly`, `limit` default 60 max 150). Eligible people: `photo_path IS NOT NULL`,
      INNER JOIN movie_people (≥1 movie, consistent with /api/people), type filter, favorites
      filter (user_person_data.is_favorite), ORDER BY RANDOM(). Each person yields entries
      (flat array, Fisher-Yates-shuffled, truncated to limit):
      - photo entry: `{ id, name, posterPath: stamped photo, fanartPath: person fanart if
        includeFanart (resolveDataPath + fs-mtime stamp like /api/people/[id]), posterBlur:
        photoBlur, type, birthYear, movieCount, personalRating, isFavorite }`
      - gallery entries (if includeGallery): up to `galleryCount` images from the person's
        gallery dir (`getPersonDir(person)/gallery`, same IMAGE_EXTENSIONS as the gallery
        route, random sample), each as its own entry with `posterPath` = gallery image path,
        `fanartPath: null`, same person meta.
      Acceptance: returns valid JSON pool; person without photo never appears; filters honored.
- [x] i18n keys (BOTH `en.json` + `zh.json`) — exact keys listed at the bottom of this file.
      Acceptance: `npx tsc --noEmit` clean, JSON valid.

## Task B — Home page People tab + PeopleHero component

- [x] `src/components/home/people-hero.tsx`: full-height wall page (like a taller HomeHero,
      no carousel fallback, no play button). Renders `HeroMosaic` with entries mapped to
      `MosaicMovie` (`title` = name) and a constructed HeroMosaicConfig
      (`{...peopleConfig-derived, style: "both", libraryWeights:{}, yearFrom/yearTo/minWidth: null}`).
      Spotlight caption (bottom-left, same typography as HomeHero): NOW SHOWING eyebrow,
      person name, meta row = localized type · birth year (or age) · movie count · ★ personal
      rating (gold, when > 0) · ♥ when favorite. Whole hero links to `/people/[id]`, plus a
      "Details" pill button. Ambient tint follows `posterBlur` via `useAmbient` like HomeHero.
      Fewer than 8 usable entries → centered empty-state message (i18n key below).
- [x] `src/app/(main)/page.tsx`: third TabsTrigger `value="people"` (label `t("peopleTab")`,
      same pill styling), TabsContent `value="people"` `className="h-full"` rendering
      PeopleHero at full height (wall covers essentially the whole area — no media-library /
      rows content). Wall pool query: `["people","hero-wall"]`, `staleTime: Infinity`,
      `refetchOnWindowFocus: false` (mirrors movie wall). Query mounts with the tab content.
      Acceptance: tab switch shows full-page people wall; spotlight rotates; caption follows;
      click lands on person detail page; movie tabs unaffected.

## Task C — Preferences: split page into Movie Wall / People Wall sections

- [x] `src/app/(main)/preferences/hero-mosaic/page.tsx`: restructure into two labelled
      sections. Section 1 "Movie Wall" = existing preview/layout/library-mix/filters cards
      (unchanged behavior). Section 2 "People Wall" = its own preview (aspect 21/9, HeroMosaic
      fed by `/api/people/hero-wall` with override params, `featuredEnabled={false}`,
      placeholderData keep-previous) + layout card (columns slider 8–24, angle picker, flow) +
      image-sources card (fanart toggle, gallery toggle + galleryCount slider 0–10 shown when
      gallery on) + filters card (person-type multi-select seg buttons — empty selection = all;
      favorites-only toggle). Section headers via i18n keys below.
- [x] Single Save button persists BOTH configs in one PUT (`heroMosaicConfig` +
      `peopleMosaicConfig`), invalidates `["userPreferences"]`, `["movies","hero-wall"]`,
      `["people","hero-wall"]`.
      Acceptance: both sections previewable and saveable; movie section behavior identical to
      before; saved people config drives the home People tab after reload.

## Verification (orchestrator)

- [x] `npx tsc --noEmit` + `npm run build` clean.
- [x] Manual: dev server → People tab wall renders, spotlight + caption, click-through,
      preferences round-trip. (chrome-devtools MCP verified 2026-07-07: tab wall + 8s
      spotlight rotation + caption follows; hero click → /people/[id]; preferences save
      round-trips both configs; API pool honors photo-required/types/favorites/gallery.)

## i18n keys (Task A adds ALL of these; B/C must not touch message files)

`home`:
- `peopleTab`: "People" / "演员"

`peopleHero`:
- `notEnough`: "Add photos to at least 8 people to light up the people wall" / "至少为 8 位演员添加头像后，演员海报墙才会点亮"
- `moviesCount`: "{count} movies" / "{count} 部作品"
- `typeActor`: "Actor" / "演员", `typeDirector`: "Director" / "导演",
  `typeWriter`: "Writer" / "编剧", `typeProducer`: "Producer" / "制片"

`heroMosaic` (additions):
- `movieWallSection`: "Movie Wall" / "电影海报墙"
- `peopleWallSection`: "People Wall" / "演员海报墙"
- `peoplePreviewTooFew`: "Not enough people match the current filters (need at least 8 with photos)" / "符合条件的演员不足（至少需要 8 位有头像的演员）"
- `imageSources`: "Image sources" / "图片来源"
- `includeFanart`: "Include fanart" / "包含背景图"
- `includeFanartDesc`: "Pair each photo with the person's own fanart" / "在头像旁配对显示演员自己的背景图"
- `includeGallery`: "Include gallery" / "包含图库"
- `includeGalleryDesc`: "Mix in images from each person's gallery" / "混入演员图库中的图片"
- `galleryCount`: "Gallery images per person" / "每位演员的图库图片数"
- `personTypes`: "Person types" / "人物类型"
- `personTypesDesc`: "Which people appear on the wall — none selected means all" / "哪些人物会出现在墙上——不选则全部"
- `favoritesOnly`: "Favorites only" / "仅收藏"
- `peopleCount`: "{count} people" / "{count} 位"

---
name: kubby
description: >
  Kubby project architecture and release workflow reference.
  Use when working on Kubby codebase: implementing features, fixing bugs,
  understanding project structure, or performing packaging/release operations.
user_invocable: true
---

# Kubby Project Reference

Self-hosted movie server built with Next.js. Dark cinema theme, Jellyfin-compatible media libraries (NFO + folder structure), TMDB scraping, HLS transcoding, multi-dimension ratings.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS v4 |
| Database | SQLite (better-sqlite3, WAL) + Drizzle ORM |
| Auth | NextAuth.js v5 (Credentials + JWT) |
| Data fetching | TanStack React Query |
| i18n | next-intl (cookie-driven, en/zh) |
| Transcoding | FFmpeg (on-demand HLS via transcode-manager singleton) |
| 3D/360° | Three.js (dynamic import, code-split ~500KB chunk) |
| Launcher | Go (getlantern/systray) for macOS/Windows desktop packaging |

## Key Architecture Patterns

- **DB lazy init**: `src/lib/db/index.ts` uses `Proxy` to defer connection until first access (avoids SQLite lock during Next.js multi-worker build)
- **globalThis singleton**: `src/lib/transcode/transcode-manager.ts` survives Next.js dev hot reload
- **HLS playback decision**: `src/lib/transcode/playback-decider.ts` — direct (MP4/WebM) / remux (MKV/MOV/TS with H.264) / transcode (mpeg4/wmv2/flv1)
- **Centralized paths**: `src/lib/paths.ts` manages all data/config/metadata paths via `KUBBY_DATA_DIR` env
- **Data directory resolution** (launcher): `KUBBY_DATA_DIR` env > `config.json` `dataDir` > OS default. Windows installer provides custom page; upgrade preserves previous choice via registry
- **Auth split**: `auth.config.ts` (lightweight, Edge-compatible) + `auth.ts` (full, with DB) — middleware imports the lightweight one
- **360° panorama**: `src/components/player/panorama-360-player.tsx` — Three.js sphere + VideoTexture, dynamic import (`ssr: false`). Player-level toggle persisted in `user_preferences.player_360_mode`. Bookmarks save camera `view_state` (lon/lat/fov), restored via URL `&vs=` param or seek bar click. Render loop pauses when video is paused; pinch-to-zoom on mobile.
- **Player controls grouping**: `src/components/player/player-controls.tsx` — Desktop: right-side buttons organized into 4 groups (Bookmarks | Mode | Playback | System) separated by `w-px h-4 bg-white/20` dividers. Text buttons (360°, speed, resolution) use unified chip style (`bg-white/10 rounded`, active `bg-primary/25 text-primary`). Mobile uses smaller icons (`h-4 w-4`) and tighter gaps (`gap-1 md:gap-1.5`) to prevent overflow. Fullscreen hidden on iOS (WebKit doesn't support Fullscreen API). **Mobile skip**: no skip buttons — double-tap left/right half of screen to skip (YouTube-style), logic in `play/page.tsx`. Single tap delayed 300ms to distinguish double-tap, then toggles play. **Mobile right panel**: speed (Gauge), skip duration (Timer, 1–60s slider dialog), resolution (transcode only). Skip duration also applies to desktop skip buttons.
- **Navigation restructure**: Three-tier navigation — content (MEDIA: All Movies) / admin (ADMIN: Libraries, Users, System) / user (Preferences, Profile). Admin items (Libraries, Users) are direct sidebar entries, not nested under Dashboard. System sub-pages (Overview, Scraper, Networking) use `(system)` route group with `AdminSidebar`. Preferences sub-pages use `PreferencesSidebar` (same pattern). Old routes: `/settings` → `/profile` + `/preferences/*`; `/card-badges` → `/preferences/card-badges`; `/personal-metadata` → `/preferences/ratings-bookmarks`.
- **GlassToast**: `src/components/ui/glass-toast.tsx` — shared toast component used across all pages. Glass style: `bg-[#0a0a0f]/70 backdrop-blur-2xl border-white/[0.08] ring-white/[0.06]`. Centered bottom (`left-1/2 -translate-x-1/2`). Success = primary Check icon, error = red AlertCircle. Supports `position="top"` for movie detail page. `className` prop for z-index override (e.g. `z-[100]` above Dialog). `aria-live="polite"` for accessibility.
- **Metadata Browser**: `src/app/(main)/metadata/browse/page.tsx` — card grid for browsing all movies/actors with filter chips (All, Incomplete, No Overview, No Date, No Fanart + actors-only: No Height, No Cup Size). Filter chips and card missing indicators share same icons (FileText/Calendar/ImageOff/Ruler/Cherry) for visual association. Lightweight cards open `MovieMetadataEditor`/`PersonMetadataEditor` on single click. Infinite scroll via `useInfiniteScroll` hook. API: `GET /api/metadata/incomplete?type=movies|people&missing=&search=&page=&limit=`. NFO writeback toggle on Providers page (`/metadata/scraper`), gated via `settings.nfo_writeback_enabled`.
- **Metadata editor Images tab**: Both `MovieMetadataEditor` (General/Cast/Images/Personal) and `PersonMetadataEditor` (General/Images/Personal) embed poster+fanart upload/delete inline, no separate `ImageEditorDialog` needed. Mobile: vertical stack (poster `w-1/2`, fanart `w-full aspect-video`); desktop: side-by-side (poster 180px, fanart `flex-1 h-[250px]`). Person editor shows "Using movie fanart" badge. Dialog width 800px on desktop. `deathDate` field hidden from person editor UI (data preserved on save).
- **People body metadata**: `people` table has `height` (cm), `weight` (kg), `measurements` (text, "88-60-90"), `cup_size` (text), `whr` (real, auto-calculated from measurements). `fanart_path` stores own fanart (DB column); person detail API falls back to movie fanart if no own fanart, with filesystem backfill for legacy data.
- **ageAtRelease auto-calculation**: `computeAgeAtRelease()` in `src/lib/scanner/index.ts` (exported). Accepts `birthDate`, `premiereDate`, `movieYear`, `birthYearOnly`. Recalculated in 3 places: scanner, person PUT (birth info change), movie PUT (year/premiereDate change or cast rebuild).
- **Dimension management**: `ratings-bookmarks/page.tsx` — managed list (not tag chips) with inline rename, up/down reorder, weight stepper (x0.5–x3.0), delete with usage count confirmation. Rename tracks chain (`movieRenames`/`personRenames` state) and queries original DB key for usage count. Weights stored in `user_preferences.movie_dimension_weights` / `person_dimension_weights` (JSON objects). `computeAverage()` in `star-rating-dialog.tsx` uses `sum(rating×weight)/sum(weight)`. Saving preferences batch-recalculates all `personalRating` values. Rename uses application-level read-modify-write (not SQLite JSON functions) for reliability.

## UI Design System

Cinema Indigo + Gold color scheme with fluid glassmorphism. Primary `#6366f1`, gold `#ca8a04`.

Glass utilities in `globals.css`: `.glass-cinema` (panels, 0.75 opacity), `.glass-badge` (tags), `.glass-btn` (icon buttons), `.glass-card` (content cards), `.transition-fluid` (spring 280ms).

Border-radius hierarchy: inputs `rounded-md` (6px) → buttons `rounded-lg` (8px) → cards `rounded-xl` (12px).

UX: `cursor-pointer` on clickables, `active:scale-95` on action buttons, `role="alert"` on errors, `aria-label` on icon buttons.

### Pitfall: `backdrop-filter` in detail pages

Movie/Person detail glass panels use **Tailwind utility** (`backdrop-blur-[20px]`) NOT `.glass-cinema` CSS class. The CSS class's `backdrop-filter` doesn't work in that context (Tailwind v4 vs custom CSS specificity issue). Also: detail page content-row must NOT have `animation` or `transform` — these create stacking contexts that block `backdrop-filter` on children.

## Reference Files

Read these on demand based on your task:

| File | When to read |
|------|-------------|
| `references/architecture.md` | Implementing features, fixing bugs, understanding DB schema, API endpoints, frontend components, scanner, player, i18n |
| `docs/architecture-v03.md` | Latest architecture snapshot (v0.3) with player controls grouping, HEVC fMP4, bookmark aspect ratio split |
| `references/release-workflow.md` | Packaging, testing builds, creating releases, publishing versions |

## Versioning

Version priority: `KUBBY_VERSION` env (CI from git tag) > `package.json` `"version"` field.

`scripts/package.ts` auto-syncs version to all platform files at build time:
- `installer/windows/kubby.nsi` — NSIS `!define VERSION` + `VIProductVersion` (Windows installer & Add/Remove Programs)
- `launcher/winres/winres.json` — Windows exe Properties > Details (5 version fields)
- `launcher/assets/Info.plist` — macOS .app bundle version (`CFBundleVersion` + `CFBundleShortVersionString`)

**Release flow**: push `v0.3.0` tag → CI extracts `0.3.0` → passes as `KUBBY_VERSION` env → all platform files auto-updated. No manual edits needed.

**Local builds**: falls back to `package.json` version.

> **Pitfall (pre-0.2.0)**: Version was hardcoded independently in 4 files with no sync. Fixed by `syncVersionToAllFiles()` in `scripts/package.ts`.

> **Pitfall: NEVER use `gh release create`** — CI auto-creates a draft release with built assets when a `v*` tag is pushed. Using `gh release create` creates a **duplicate** release (one with assets, one without). Always use `gh release edit` + `gh api PATCH` to add notes and publish the CI-created draft. See `references/release-workflow.md` step 5-6.

> **Pitfall: Schema changes require TWO updates.** Adding a column to `src/lib/db/schema.ts` is NOT enough — you MUST also add a corresponding `ALTER TABLE ... ADD` statement to the `pending` migration array in `src/lib/db/index.ts`. The migration array runs on every startup with try/catch (skips if column exists). Without it, existing databases will crash with `no such column` errors. `npx drizzle-kit push` only works for local dev; production/packaged builds rely solely on the migration array.

> **Pitfall: Tag push builds ALL platforms.** For testing a single platform, use `gh workflow run release.yml --field platform=win-x64` (or `darwin-arm64`/`darwin-x64`). Only push a `v*` tag when doing a full release.

## Common Commands

```bash
npm run dev                    # Dev server at localhost:8665
npm run build                  # Production build (standalone)
npx drizzle-kit push           # Push schema changes to DB
npx tsc --noEmit               # Type check without emitting
npx tsx scripts/package.ts     # Package for current platform
```

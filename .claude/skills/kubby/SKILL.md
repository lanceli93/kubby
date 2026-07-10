---
name: kubby
description: >
  Kubby project reference: architecture, conventions, release workflow, and the
  multi-model subagent workflow for this repo. Use this WHENEVER working on the
  Kubby codebase — implementing a feature, fixing a bug, understanding project
  structure, touching the DB schema, or packaging/releasing — even if the request
  doesn't name "Kubby". Read it before planning any non-trivial change.
user_invocable: true
---

# Kubby Project Reference

Self-hosted media server built with Next.js. Dark cinema theme (shared across all
domains). Multi-domain: **🎬 Cinema** (Jellyfin-compatible movie libraries — NFO +
folder structure, TMDB scraping, HLS transcoding, multi-dimension ratings) and
**📷 Photos** (photo + video timeline library — EXIF, virtual-scroll grid, lightbox,
inline video playback). Music is designed but unscheduled.

## Domain separation

Each media domain owns independent tables / scanner branch / API routes / homepage,
but shares infra: library management, image serving, the playback pipeline
(`playback-decider` + `transcode-manager`), auth, and i18n. A domain switcher lives
as a dropdown on the Kubby brand in `AppHeader` (only rendered when a photo library
exists — `useHasPhotoLibrary()`). `DomainCookieSync` persists the last domain in a
`kubby-domain` cookie so the root can jump to the right homepage; it self-heals a
stale `photos` cookie when no photo library exists (the Edge proxy redirect can't
query the DB). **When adding a domain, follow this separation — do not fork the
movie code path.**

## Working on this repo: delegate to subagents

For any feature or bug fix beyond a trivial one-liner, **orchestrate rather than do
everything yourself**. This is faster (parallel work) and cheaper (expensive
planning/review model isn't spent on routine coding). The pattern:

1. **Plan it yourself.** Break the work into small, independently-verifiable tasks.
   Write them as a checklist (`docs/feature-request.md` or a working task file),
   each with a one-line acceptance criterion.
2. **Delegate each task to the `executor` subagent** (`.claude/agents/executor.md`).
   Give it just that task + the context/files it needs + the checklist path.
   - Simple/mechanical task → let it default to **sonnet**.
   - Complex/risky task (tricky logic, cross-cutting, perf-sensitive) → spawn the
     executor with **`model: opus`**.
   - Independent tasks → delegate in parallel (multiple Agent calls in one turn).
3. **Verify each result yourself.** Read the executor's report and the actual diff;
   re-run build/typecheck/tests as needed. Accept only if it meets the criterion,
   else send it back with specific feedback.
4. **Record & commit.** You own commits and doc updates (see Doc Maintenance below).

Full playbook: `docs/multi-model-workflow.md`. When the whole repo runs a Fable
orchestrator with opus/sonnet executors, this is the intended loop.

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

## Core Architecture Invariants

These hold across the whole codebase — know them before changing anything.

- **DB lazy init**: `src/lib/db/index.ts` uses `Proxy` to defer connection until
  first access (avoids SQLite lock during Next.js multi-worker build).
- **globalThis singleton**: `src/lib/transcode/transcode-manager.ts` survives
  Next.js dev hot reload (version key in the global).
- **HLS playback decision**: `src/lib/transcode/playback-decider.ts` — direct
  (MP4/WebM) / remux (MKV/MOV/TS with H.264) / transcode (mpeg4/wmv2/flv1).
- **Centralized paths**: `src/lib/paths.ts` manages all data/config/metadata paths
  via `KUBBY_DATA_DIR` env. Never hardcode paths.
- **Auth split**: `auth.config.ts` (lightweight, Edge-compatible, no DB) + `auth.ts`
  (full, with DB). Middleware imports the lightweight one.
- **Data directory resolution** (launcher): `KUBBY_DATA_DIR` env > `config.json`
  `dataDir` > OS default. Windows installer provides a custom page; upgrade
  preserves the previous choice via registry.

## Critical Pitfalls (these break production if missed)

> **Schema changes require TWO updates.** Adding a column to
> `src/lib/db/schema.ts` is NOT enough — you MUST also add a matching
> `ALTER TABLE ... ADD` statement to the `pending` migration array in
> `src/lib/db/index.ts`. That array runs on every startup with try/catch (skips if
> the column exists). Without it, existing databases crash with `no such column`.
> `npx drizzle-kit push` only works for local dev; production/packaged builds rely
> solely on the migration array.

> **NEVER use `gh release create`.** CI auto-creates a draft release with built
> assets when a `v*` tag is pushed. `gh release create` makes a **duplicate**
> release. Always `gh release edit` + `gh api PATCH` the CI-created draft. See
> `references/release-workflow.md`.

> **Publishing needs `make_latest=true`.** A bare `-F draft=false` PATCH publishes
> but leaves the OLD version marked "Latest" — the repo homepage keeps showing the
> previous release, so the new one is invisible. Always add `-F make_latest=true`.
> See `references/release-workflow.md` step 6.

> **Tag push builds ALL platforms.** To test a single platform, use
> `gh workflow run release.yml --field platform=win-x64` (or
> `darwin-arm64`/`darwin-x64`). Only push a `v*` tag for a full release.

## Common Commands

```bash
npm run dev                    # Dev server at localhost:8665
npm run build                  # Production build (standalone)
npx drizzle-kit push           # Push schema changes to DB (local dev only)
npx tsc --noEmit               # Type check without emitting
npx tsx scripts/package.ts     # Package for current platform
```

## Versioning

Version priority: `KUBBY_VERSION` env (CI from git tag) > `package.json` `"version"`.
`scripts/package.ts` `syncVersionToAllFiles()` auto-syncs the version to all platform
files at build time (NSIS installer, Windows exe winres, macOS Info.plist) — no
manual edits. Release flow: push `v0.x.y` tag → CI extracts version → passes as
`KUBBY_VERSION` → all platform files updated. Local builds fall back to
`package.json`. Full release checklist in `references/release-workflow.md`.

## Doc Maintenance (per project CLAUDE.md)

- After a big feature: update the latest `docs/architecture-v0.x-mvp.md`.
- Remove completed items from `docs/feature-request.md`, record in
  `docs/feature-completed.md`.
- Git commit with a short message after many code changes, and call out that you
  committed / updated docs.

## Reference Files — read on demand

| File | When to read |
|------|-------------|
| `references/architecture.md` | Project structure, DB schema (14 tables), API endpoints, scanner (movie + photo branches), playback internals, theme, i18n, data dirs, mobile responsive. Read when implementing features or fixing bugs that touch these. |
| `references/feature-patterns.md` | How a specific feature is built — 360° player, player controls, navigation, domain switcher, photos timeline/lightbox, GlassToast, metadata browser/editor, people body metadata, dimension management, UI design system. Read the one section matching your task. |
| `references/release-workflow.md` | Packaging, testing builds, creating and publishing releases. |
| `references/readme-media-capture.md` | (Re)generating README screenshots + animated demos: ffmpeg ddagrab recording, mp4→animated-WebP, chrome-devtools MCP screenshots, seeding demo data (ratings/bookmarks/gallery) via API, prod-build-on-8665 setup. Read when updating `docs/screenshots/`. |
| `docs/multi-model-workflow.md` | The Fable-orchestrates / opus-sonnet-executes workflow in full. |
| latest `docs/architecture-v0.x-mvp.md` | Current architecture snapshot to update after big features. |

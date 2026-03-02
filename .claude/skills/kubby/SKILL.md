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
| Launcher | Go (getlantern/systray) for macOS/Windows desktop packaging |

## Key Architecture Patterns

- **DB lazy init**: `src/lib/db/index.ts` uses `Proxy` to defer connection until first access (avoids SQLite lock during Next.js multi-worker build)
- **globalThis singleton**: `src/lib/transcode/transcode-manager.ts` survives Next.js dev hot reload
- **HLS playback decision**: `src/lib/transcode/playback-decider.ts` — direct (MP4/WebM) / remux (MKV/MOV/TS with H.264) / transcode (mpeg4/wmv2/flv1)
- **Centralized paths**: `src/lib/paths.ts` manages all data/config/metadata paths via `KUBBY_DATA_DIR` env
- **Auth split**: `auth.config.ts` (lightweight, Edge-compatible) + `auth.ts` (full, with DB) — middleware imports the lightweight one

## Reference Files

Read these on demand based on your task:

| File | When to read |
|------|-------------|
| `references/architecture.md` | Implementing features, fixing bugs, understanding DB schema, API endpoints, frontend components, scanner, player, i18n |
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

## Common Commands

```bash
npm run dev                    # Dev server at localhost:3000
npm run build                  # Production build (standalone)
npx drizzle-kit push           # Push schema changes to DB
npx tsc --noEmit               # Type check without emitting
npx tsx scripts/package.ts     # Package for current platform
```

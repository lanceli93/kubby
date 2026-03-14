# Release Notes

## v0.1.1 (2026-02-28) — Bug Fixes

Patch release fixing several issues found after v0.1.0.

### Bug Fixes

- **Setup wizard: library silently not created** — if the user filled in folder paths but left the library name blank, the library was silently skipped with no error. Now shows a validation message.
- **Images broken for filenames containing `..`** — the path traversal check (`includes("..")`) rejected legitimate folder names like `A...B`. Changed to per-segment check so only actual `../` traversal is blocked.
- **PotPlayer stuck when seeking** — the `/seek` parameter was placed after the file path (PotPlayer expects it before) and used milliseconds instead of seconds. Fixed argument order and unit in both local and stream modes.

### Improvements

- **Scan: no more auto-scan after setup** — previously the homepage auto-scanned newly created libraries, making setup feel slow. Libraries now show an "unscanned" overlay with a "Scan Now" button.
- **Scan: skipped folder feedback** — folders that can't be imported (no NFO, no video, parse error) are now tracked and displayed. The global scan bar shows "Scanned X movies, Y skipped" with an expandable list of skip reasons.
- **Scan: movie title in progress** — the scan bar now shows the current folder name: "Scanning: Inception (42/100)". Long titles are truncated with ellipsis.
- **External player debug logging** — the full command sent to PotPlayer/IINA is now logged to the server console and returned in the API response. Check browser console (F12) after clicking play to see the exact command for troubleshooting.

### Platforms

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon) | Kubby-arm64.dmg |
| macOS (Intel) | Kubby-x64.dmg |
| Windows | KubbySetup.exe |
| Docker (amd64) | `ghcr.io/lanceli93/kubby:0.1.1` |

---

## v0.1.0 (2026-02-28) — Pre-release

Kubby's first release! A self-hosted movie server inspired by Jellyfin, rebuilt from scratch with a modern stack.

### Features

- **Jellyfin-style dark UI** — familiar browse / detail / play layout
- **Drop-in compatible** with existing Jellyfin and Kodi libraries (NFO + folder structure)
- **TMDB scraper** — automatic metadata, posters, actor photos, and biographies
- **In-browser playback** — progress tracking, multi-disc support, playback speed control
- **Multi-dimension ratings** — define custom rating dimensions for movies and actors, sort library by any dimension
- **Poster & actor badges** — personal rating, resolution (4K/1080p), actor tier displayed on cards
- **Actor photo gallery** — justified row layout with lightbox viewer, drag-and-drop reordering
- **Filmography sorted by age** — see how old an actor was in each film
- **Video bookmarks** — quick bookmark (B key) or detailed bookmark (Shift+B) with custom icons, tags, notes
- **External player** — one-click open in IINA (macOS) or PotPlayer (Windows) for HEVC/DTS
- **Search** — movies, actors, and bookmarks with category filtering
- **Lazy loading** — infinite scroll instead of pagination for all library views
- **Jellyfin compatibility mode** — read-only mode that won't modify your existing Jellyfin library
- **English / Chinese** interface (i18n)
- **Setup wizard** — first-run guided setup for admin account and media library

### Platforms

| Platform | Format |
|----------|--------|
| macOS (Apple Silicon) | Kubby-arm64.dmg |
| macOS (Intel) | Kubby-x64.dmg |
| Windows | KubbySetup.exe |
| Docker (amd64) | `ghcr.io/lanceli93/kubby:0.1.0` |

### Docker

```bash
docker run -d \
  -p 8665:8665 \
  -v kubby-data:/data \
  -v /path/to/movies:/media \
  ghcr.io/lanceli93/kubby:0.1.0
```

### Known Issues

- macOS: unsigned app — right-click → Open on first launch
- Windows: may trigger SmartScreen warning — click "More info" → "Run anyway"
- No auto-update — users must manually download new versions
- Video plays natively in browser — no transcoding (depends on browser codec support)

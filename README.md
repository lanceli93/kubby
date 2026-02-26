[English](README.md) | [中文](README.zh-CN.md)

# Kubby

A self-hosted movie server with personal metadata features that Jellyfin doesn't have. Built with Next.js.

![Kubby screenshot](docs/screenshots/hero.png)

## Basics

- Jellyfin-style dark UI with familiar browse/detail/play layout
- Drop-in compatible with existing Jellyfin and Kodi movie libraries (NFO + folder structure)
- TMDB scraper for automatic metadata, posters, actor photos, and biographies
- In-browser playback with progress tracking and multi-disc support
- English / Chinese interface

## What Kubby adds

### Multi-dimension ratings

Rate movies on your own dimensions — plot, cinematography, soundtrack, whatever you care about. Then sort your entire library by any single dimension.

Got 500 movies and want something with great cinematography tonight? Sort by that dimension and pick from the top.

![Multi-dimension ratings](docs/screenshots/dimension-ratings.png)

### Poster and actor badges

Your personal rating, resolution (4K/1080p/etc.), and actor tier (S/A/B/...) show directly on cards while browsing. All configurable per-user — turn off what you don't need.

![Card badges](docs/screenshots/card-badges.png)

### Actor photo gallery

Upload photos for actors you follow. Justified row layout (Google Photos style) with a lightbox viewer. Not much more to say — it just works.

![Actor gallery](docs/screenshots/actor-gallery.png)

### Filmography sorted by age

On actor detail pages, sort their filmography by the age they were at time of release. Useful when you want to trace someone's career chronologically or just curious what they looked like at 25.

![Filmography by age](docs/screenshots/filmography-age.png)

### External player

Browser can't handle HEVC or DTS? One click opens IINA (macOS) or PotPlayer (Windows). Toggle between local file playback and streaming from server, depending on whether the player is on the same machine.

![External player](docs/screenshots/external-player.png)

### Video bookmarks

Mark scenes with B (quick) or Shift+B (with icon, tags, note). Bookmarks show as colored dots on the progress bar. 9 built-in icons plus support for custom uploaded icons.

Find your bookmarked scenes later from the movie detail page.

![Video bookmarks](docs/screenshots/bookmarks.png)

### Search with categories

Search across movies, actors, and your bookmarks in one place. Filter by category to narrow results.

![Enhanced search](docs/screenshots/search.png)

## Quick start (development)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the setup wizard handles admin account creation and media library setup.

## Installation (macOS)

### 1. Download

Download `Kubby.dmg` from the [Releases](https://github.com/kubby-app/kubby/releases) page.

### 2. Install

1. Double-click `Kubby.dmg` to open
2. Drag **Kubby.app** into the **Applications** folder
3. Eject the DMG

### 3. First launch

macOS blocks unsigned apps by default. To open Kubby the first time:

1. Open **Applications** folder, **right-click** Kubby → **Open**
2. Click **Open** in the confirmation dialog

This is only needed once. After that, Kubby opens normally by double-clicking.

Alternatively: System Settings → Privacy & Security → scroll down → click **Open Anyway**.

### What happens on launch

- Starts a local server at `http://localhost:3000`
- Opens your browser automatically
- Shows a Kubby icon in the Dock and menu bar (top right)
- Stores data in `~/Library/Application Support/Kubby/`

### Quit

Right-click the Kubby icon in the Dock → **Quit**, or click the tray icon in the menu bar → **Quit**.

### Uninstall

1. Drag Kubby from Applications to Trash
2. (Optional) Delete user data: `rm -rf ~/Library/Application\ Support/Kubby`

### About macOS gatekeeper

| Status | User Experience |
|--------|----------------|
| **Unsigned** (current) | "Can't be opened" dialog — right-click → Open to bypass (once) |
| **Signed** (Developer ID, $99/year) | "From an identified developer" — user can click Open directly |
| **Signed + Notarized** | No warning at all, same as App Store apps |

## Installation (Windows)

### 1. Download

Download `KubbySetup.exe` from the [Releases](https://github.com/kubby-app/kubby/releases) page.

### 2. Install

1. Double-click `KubbySetup.exe`
2. Follow the installer wizard (choose install location → Install)
3. Check **Launch Kubby** on the finish page

The installer creates Start Menu and Desktop shortcuts.

### 3. First launch

Windows SmartScreen may warn about unsigned apps. Click **More info** → **Run anyway**.

### What happens on launch

- Starts a local server at `http://localhost:3000`
- Opens your browser automatically
- Shows a Kubby icon in the system tray (bottom-right)
- Stores data in `%LOCALAPPDATA%\Kubby\`

### Quit

Right-click the Kubby icon in the system tray → **Quit**. This stops all background processes (kubby.exe and node.exe).

### Upgrade

Run the new `KubbySetup.exe`. It closes the running instance, overwrites the old install, and keeps your data.

### Uninstall

Control Panel → Programs and Features → Kubby → Uninstall. Or use the **Uninstall Kubby** shortcut in Start Menu.

User data in `%LOCALAPPDATA%\Kubby\` is kept. Delete it manually if you want a clean removal.

## Installation (Docker / Linux / NAS)

Supports **amd64** and **arm64**. Works on Synology, QNAP, Unraid, and any Linux server.

### Docker Compose (recommended)

```yaml
services:
  kubby:
    image: ghcr.io/kubby-app/kubby:latest
    ports:
      - "3000:3000"
    volumes:
      - kubby-data:/data
      - /path/to/your/movies:/media
    restart: unless-stopped

volumes:
  kubby-data:
```

```bash
docker compose up -d
```

Open `http://<your-server-ip>:3000`.

### Docker CLI

```bash
docker run -d \
  --name kubby \
  -p 3000:3000 \
  -v kubby-data:/data \
  -v /path/to/your/movies:/media \
  --restart unless-stopped \
  ghcr.io/kubby-app/kubby:latest
```

### Volumes

| Mount | Purpose |
|-------|---------|
| `/data` | Database, config, logs, metadata (persist this!) |
| `/media` | Your media library folders (read-write, Kubby writes NFO/poster files here) |

### Update

```bash
docker compose pull && docker compose up -d
```

### Build image locally

```bash
git clone <repo> && cd kubby
docker build -t kubby .
docker run -d -p 3000:3000 -v kubby-data:/data kubby
```

## Build from source

### Prerequisites

- Node.js 22+
- Go 1.25+
- npm

### Package

```bash
npm install
npx tsx scripts/package.ts                       # macOS → Kubby.dmg
npx tsx scripts/package.ts --platform win-x64    # Windows → KubbySetup.exe
```

Each package (~80-90 MB) contains:
- Go launcher (system tray + process management)
- Node.js runtime
- ffprobe binary
- Next.js standalone server

Add `--skip-build` to skip Next.js rebuild, `--skip-download` to reuse cached binaries. Windows can be cross-built from macOS (native modules are automatically swapped).

### Cross-platform packaging

```bash
npx tsx scripts/package.ts --platform darwin-arm64   # macOS Apple Silicon
npx tsx scripts/package.ts --platform darwin-x64     # macOS Intel
npx tsx scripts/package.ts --platform win-x64        # Windows
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS v4 |
| Database | SQLite (better-sqlite3, WAL mode) |
| Auth | NextAuth.js v5 (Credentials + JWT) |
| Launcher | Go (getlantern/systray) |

## License

GPL-2.0

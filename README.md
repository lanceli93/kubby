# Kubby

A self-hosted media server for managing and streaming your personal movie collection. Inspired by Jellyfin, built with Next.js.

## Features

- NFO + folder-based media library scanning (Kodi/Jellyfin compatible)
- TMDB scraper for automatic metadata, posters, and actor photos
- In-browser video playback with progress tracking
- Multi-disc movie support
- Personal rating system with custom dimensions
- Actor detail pages with photo gallery
- i18n support (English / Chinese)
- External player integration (IINA, PotPlayer)

## Quick Start (Development)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the setup wizard will guide you through creating an admin account and adding your first media library.

## Installation (macOS)

### 1. Download

Download `Kubby.dmg` from the [Releases](https://github.com/kubby-app/kubby/releases) page.

### 2. Install

1. Double-click `Kubby.dmg` to open
2. Drag **Kubby.app** into the **Applications** folder
3. Eject the DMG

### 3. First Launch

macOS will block unsigned apps downloaded from the internet. To open Kubby for the first time:

1. Open **Applications** folder, **right-click** Kubby → **Open**
2. Click **Open** in the confirmation dialog

This is only needed once. After that, Kubby opens normally by double-clicking.

Alternatively: System Settings → Privacy & Security → scroll down → click **Open Anyway**.

### What Happens on Launch

- Kubby starts a local server at `http://localhost:3000`
- Your browser opens automatically
- The Kubby icon appears in the Dock and the menu bar (top right)
- Data is stored in `~/Library/Application Support/Kubby/`

### Quit

Right-click the Kubby icon in the Dock → **Quit**, or click the tray icon in the menu bar → **Quit**.

### Uninstall

1. Drag Kubby from Applications to Trash
2. (Optional) Delete user data: `rm -rf ~/Library/Application\ Support/Kubby`

### About macOS Gatekeeper

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

### 3. First Launch

Windows SmartScreen may show a warning for unsigned apps. Click **More info** → **Run anyway**.

### What Happens on Launch

- Kubby starts a local server at `http://localhost:3000`
- Your browser opens automatically
- The Kubby icon appears in the system tray (bottom-right)
- Data is stored in `%LOCALAPPDATA%\Kubby\`

### Quit

Right-click the Kubby icon in the system tray → **Quit**. This stops all background processes (kubby.exe and node.exe).

### Upgrade

Run the new `KubbySetup.exe` — it automatically closes the running instance and overwrites the old installation. Your data is preserved.

### Uninstall

Control Panel → Programs and Features → Kubby → Uninstall. Or use the **Uninstall Kubby** shortcut in Start Menu.

User data in `%LOCALAPPDATA%\Kubby\` is preserved. Delete it manually if you want a clean removal.

## Installation (Docker / Linux / NAS)

Supports **amd64** and **arm64** — works on Synology, QNAP, Unraid, and any Linux server.

### Docker Compose (recommended)

Create a `docker-compose.yml`:

```yaml
services:
  kubby:
    image: ghcr.io/kubby-app/kubby:latest
    ports:
      - "3000:3000"
    volumes:
      - kubby-data:/data
      - /path/to/your/movies:/media:ro
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
  -v /path/to/your/movies:/media:ro \
  --restart unless-stopped \
  ghcr.io/kubby-app/kubby:latest
```

### Data & Volumes

| Mount | Purpose |
|-------|---------|
| `/data` | Database, config, logs, metadata (persist this!) |
| `/media` | Your media library folders (read-only is fine) |

### Update

```bash
docker compose pull && docker compose up -d
```

## Build from Source

### Prerequisites

- Node.js 22+
- Go 1.22+
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

### Cross-platform Packaging

```bash
npx tsx scripts/package.ts --platform darwin-arm64   # macOS Apple Silicon
npx tsx scripts/package.ts --platform darwin-x64     # macOS Intel
npx tsx scripts/package.ts --platform win-x64        # Windows
npx tsx scripts/package.ts --platform linux-x64      # Linux
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS v4 |
| Database | SQLite (better-sqlite3, WAL mode) |
| Auth | NextAuth.js v5 (Credentials + JWT) |
| Launcher | Go (getlantern/systray) |

## License

MIT

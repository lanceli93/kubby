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

## Build from Source

### Prerequisites

- Node.js 22+
- Go 1.22+
- npm

### Package for macOS

```bash
npm install
npx tsx scripts/package.ts
```

This produces `dist/Kubby.dmg` (~93 MB) and `dist/Kubby.app`, containing:
- Go launcher (system tray + process management)
- Node.js runtime
- ffprobe binary
- Next.js standalone server

Add `--skip-build` to skip Next.js rebuild, `--skip-download` to reuse cached Node.js/ffprobe binaries.

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

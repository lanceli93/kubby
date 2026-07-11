# Completed Features / Work Log

Reverse-chronological. Detailed patterns live in the kubby skill
(`.claude/skills/kubby/`); this is a short ledger of shipped work.

## 2026-07-11 — Music: split symbol-joined artist names

Scanner used to treat a collaboration tag ("周杰伦&林迈可") as ONE artist, which
also blocked same-title duet/solo tracks from grouping into one album (grouping
keys on shared artist id).

- **`lib/music/artist-split.ts` → `splitArtistNames()`** — language-aware split:
  `、` always; `&`/`＆` when a CJK char is adjacent on EITHER side; `-`/`－` only
  when CJK on BOTH sides. Western band names preserved ("AC/DC", "Simon &
  Garfunkel", "Jay-Z", "Earth, Wind & Fire"). NUL sentinel so spaces in names
  survive. 17 unit cases pass.
- **Scanner** derives artists via the splitter (dedupe, order-stable) → album
  grouping then collapses duet+solo tracks naturally (no grouping-algo change).
- **Backfill** (`backfillArtistSplits`, runs at scan start, idempotent): splits
  legacy combined-artist ROWS, rewires their track/album joins to the parts,
  deletes the combined row, then merges same-title albums that now share an artist
  (fixed-point, gap-fills cover/year). Old libraries self-heal on next rescan.
- Verified via an end-to-end temp-DB scan test (8 assertions: split, merge, track
  re-parent, join rewire, cover gap-fill) + tsc + eslint clean.

## 2026-07-11 — QQ-Music-style Now Playing overlay

Redesigned the full-screen music Now Playing overlay to mimic QQ Music. Pattern
detail in the skill (`references/feature-patterns.md` → Music library + global
player). Orchestrated as 3 executor subagents (Web Audio / vinyl+lyrics / overlay
restructure), each verified + a concurrency fix folded in by the orchestrator.

- **Rotating vinyl disc** (`vinyl-disc.tsx`) — simple dark grooved disc, large
  circular cover label (~64% diameter, per feedback the vinyl ring was too heavy),
  spins via `.music-vinyl-spin`, freezes on pause, reduced-motion aware.
- **Real audio spectrum** (`audio-spectrum.tsx` + `ensureAnalyser()` in the player
  provider) — Web Audio `AnalyserNode` on the singleton `<audio>`, canvas rAF bars.
  Safe-sequencing so audio is never silenced (resume-first, one-shot source, never
  disconnect, **in-flight-promise-memoized** build so the two concurrent spectrum
  mounts + StrictMode don't race a second `createMediaElementSource`).
- **Left-aligned lyrics** (`LyricsView align="left"`), **left-aligned** in the
  desktop right pane; self-scroll centering untouched.
- **Bottom transport bar** — favorite heart (own query/mutation) + mini info ·
  spectrum + transport + long seek · volume popover + queue-drawer toggle.
- **Queue drawer** — right-anchored, frosted glass mirroring the homepage
  `NavSidebar` drawer (dimming blur scrim + translucent panel + inset edge highlight).
- **Adaptive ambient glow** — background halo + spectrum tint follow the album
  cover's dominant colour via the existing `extractAmbientColor` helper.

Verified in-browser (chrome-devtools MCP): vinyl spin/freeze, spectrum reacts to
audio + survives overlay close/reopen, **audio keeps playing after closing the
overlay** (the key regression), adaptive glow matches cover, drawer glass + scrim
click-to-close.

## 2026-07-11 — Backend review + hardening (`574f5ec`)

Four-dimension read-only review (cross-domain / API security / robustness / DB) via
parallel subagents, each High self-verified before fixing. Methodology + findings
recorded in the skill (`references/feature-patterns.md` → Backend review checklist).

Shipped (hardening only, no behavior change for existing libraries / playback):
- Confined `/api/images/[...path]` to library-folder + data-dir roots (was an
  authenticated arbitrary-file-read of `kubby.db`/`.env`/keys).
- Anchored the public stream regex to exactly `/stream` so `/stream/decide` (spawns
  ffmpeg) is no longer reachable unauthenticated.
- Server-side per-library scan lock (released in `finally`) + library-still-exists
  re-check before the destructive end-of-scan cleanup in all three scanners.
- Coalesced concurrent per-session seeks in the transcode manager (no duplicate
  ffmpeg on rapid scrubbing).
- Prune orphan `music_artists` on music-library delete (global table, no FK cascade).
- 8 idempotent backfill ALTERs; migration catch logs non-benign failures instead of
  swallowing all; removed plaintext-password log in `setup/complete`.

Deferred (面广 / 需策略, not done this pass): admin-vs-user authorization layer,
transcode session cap, streaming HLS segments instead of `readFileSync`.

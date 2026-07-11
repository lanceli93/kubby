# Completed Features / Work Log

Reverse-chronological. Detailed patterns live in the kubby skill
(`.claude/skills/kubby/`); this is a short ledger of shipped work.

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

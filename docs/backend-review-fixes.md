# Backend Review — Fix Checklist (推荐批次)

Source: cross-domain / security / robustness / DB review, 2026-07-11.
Constraint: **must not change behavior for existing libraries or normal playback.**
All fixes are hardening: guards, locks, cleanup, idempotent migrations.

- [x] **T1 — `/api/images` path confinement (H1).** Confine resolved image path to an
  allowlist of roots (all `media_libraries.path` + `getDataDir()`), else 403.
  Legitimate movie posters/fanart live inside library folders; people/bookmark/
  photo-thumb/music-art live under the data dir. Must still serve every currently
  working image. Accept: requesting `.../data/kubby.db` or a path outside any
  library/data root → 403; a real poster inside a library folder → still 200.

- [x] **T2 — `/stream/decide` no longer public (H2).** Tighten the public regex in
  `src/lib/auth.config.ts` so only the direct-play stream endpoint stays public
  (needed for `<video src>`); `/stream/decide` must require a session. Accept:
  `/api/movies/{id}/stream/decide` unauthenticated → redirect/401; direct
  `/api/movies/{id}/stream` (and the HLS `/api/stream/[sessionId]/...`) still play.

- [x] **T3 — Server-side scan lock + mid-delete recheck (H3).** Module-level
  in-progress `Set<libraryId>` in the scanner; second concurrent scan of the same
  library is rejected/no-op with a clear message. Before the scan's final
  cleanup/lastScannedAt write, re-check the library still exists; bail cleanly if
  deleted mid-scan. Accept: two rapid scans of one library → only one runs;
  deleting a library mid-scan → no crash, no rows written for the dead library.

- [x] **T4 — Serialize seek per session (H3b).** Guard `seekSession` in
  transcode-manager with a per-session in-flight flag so two rapid seeks can't each
  spawn a fresh ffmpeg/session. Accept: rapid scrubbing spawns at most one new
  session; no orphaned ffmpeg/HLS dir beyond the one active session.

- [x] **T5 — Prune orphan artists on music-library delete (#4).** In the
  `lib.type === "music"` branch of library DELETE, call the existing
  `pruneOrphanArtists()` after cascade. Accept: deleting a music library leaves no
  0-track/0-album artist rows; movie/photo delete unaffected.

- [x] **T6 — Add 8 missing idempotent ALTERs (#8).** Append `ALTER TABLE ... ADD`
  for `movies.video_codec/audio_codec/video_width/video_height/audio_channels/
  container`, `media_libraries.scraper_enabled`, `users.locale` to the `pending`
  array in `src/lib/db/index.ts`. Match schema.ts types/defaults exactly. Accept:
  fresh DB unchanged; a DB missing these columns gets them; no duplicate-column
  crash on a DB that already has them.

- [x] **T7 — Redact secrets in setup log + selective migration catch (#7,#10).**
  `setup/complete` must not log the plaintext admin password / TMDB key. The
  startup migration try/catch in `db/index.ts` should swallow only
  duplicate-column/"already exists" errors and `console.error` (not throw) others.
  Accept: setup no longer logs credentials; a genuinely broken migration surfaces
  in logs instead of silently passing.

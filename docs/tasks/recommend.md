# 今晚看什么 — draw-a-hand recommendations (cinema)

Branch: `feat/recommend`. Spec + decisions: `docs/feature-request.md`.
Shared contract: `src/lib/recommend/types.ts` (owned by the orchestrator — ask
before changing it). Visual references (local only, gitignored):
`data/demos/recommend/b-vortex.html` (default theme) and `a-tabletop.html`.

## Wave 1 (parallel)

- [x] **R1 — Play counting.** Movies + TV. Successful external-player launch →
  upsert user-data `playCount + 1`, `lastPlayedAt = now` (TV: also bump parent
  show `user_tv_show_data.lastPlayedAt`). In-app: the user-data PUT accepts
  `countPlay: true` → `playCount + 1`; `useProgressSave` sends it on the FIRST
  progress save of a playback session only.
  *Accept:* PotPlayer launch = +1 + appears in recently played; one in-app
  viewing = +1 (not per 10s save); tsc clean.
- [x] **R2 — Engine + API + DB.** `recommendation_history` table +
  `user_preferences.recommend_theme` column (schema.ts AND db/index.ts
  CREATE/ALTER). `src/lib/recommend/engine.ts`; routes
  `GET /api/movies/recommend/pool`, `POST /api/movies/recommend/draw`,
  `POST /api/movies/recommend/history`; theme via existing prefs API.
  *Accept:* contract in types.ts honoured; weighted-random + diversity + 30-day
  decay + dismiss penalty + reasons; cinema-only (movie libraries allowlist);
  per-user; tsc clean; curl smoke test passes.
- [x] **R3 — Page shell + Vortex scene + hero entry.** `/movies/recommend` page,
  filter bar/presets/mix/theme switch, hand interactions (lock, dismiss, open,
  play), `recommend` i18n namespace (en+zh), Vortex scene ported from demo B,
  scene interface for a second theme, hero "今晚看什么" button.
  *Accept:* page works end-to-end against R2; tsc clean; 60fps-ish; no
  cross-domain data.

## Wave 2

- [ ] **R4 — Tabletop scene** ported from demo A, behind the same scene
  interface; theme switch persists per user.
  *Accept:* switching themes keeps filters + hand; tsc clean.
- [ ] **R5 — Docs.** Kubby skill (SKILL.md table count, architecture.md
  schema/API, feature-patterns.md section); remove the feature from
  `docs/feature-request.md`.

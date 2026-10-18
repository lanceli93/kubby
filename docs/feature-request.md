# Feature Requests

## 🎬 Cinema: "今晚看什么" 抽卡推荐 (Recommend / Draw)

When the user doesn't know what to watch: set a few simple filters, then "draw" a
hand of 3–5 recommendations out of a messy card pile. Not a search — the **pile is the
filtered candidate pool** (non-matching cards fly out of the pile live as filters
change), the **draw is the recommendation** (weighted-random, personalised, diverse,
explained).

### Decisions (2026-10-18)

- **Uses personal signals** (per-user): personal rating, dimension ratings, favorites,
  favorite/rated people, play history (`isPlayed`, `playCount`, `lastPlayedAt`).
- **Entry point**: a button in the cinema homepage hero → recommend page.
- **Cross-session de-dup**: a card shown in a draw should not reappear for ~30 days
  (soft — penalty decays over 30 days; if the pool is too small, repeats are allowed
  rather than returning an empty hand). Needs a new per-user history table.
- **Mixed deck**: hands contain movies **and** actors (design TBD, see below).
- **Visual effect**: two switchable themes — **星云漩涡 Vortex (default)** and
  **牌桌洗牌 Tabletop** — ported from the HTML demos `b-vortex.html` /
  `a-tabletop.html` in `data/demos/recommend/` (local only, gitignored). Theme is
  a per-user preference. Implementation checklist: `docs/tasks/recommend.md`.

### Prerequisite: play counting is broken

- `userMovieData.playCount` is **never incremented** anywhere: the in-app player
  (`use-progress-save.ts`) only writes position + `lastPlayedAt`; the
  external-player route (`/api/movies/[id]/play-external`, PotPlayer/VLC/IINA) writes
  **nothing** to user data. Same for TV (`/api/tv/episodes/[id]/play-external`).
- Fix: count a "play start" once per playback session (in-app) and on every
  successful external launch: `playCount + 1`, `lastPlayedAt = now` (upsert the
  user-data row). TV external launch should also bump the parent show's
  `lastPlayedAt` like the in-app save does.
- Acceptance: launching a movie in PotPlayer increments its play count and moves it
  to the top of "continue watching / recently played"; one in-app viewing = +1, not
  +1 per 10s progress save.

### Engine (server-side, rule-based)

- Hard filters → SQL (genres/tags/year range/rating range/runtime/played state).
- Soft preferences + personal signals + quality − freshness penalty → score in JS.
- Weighted random sample of k (not top-k) + diversity constraint (≤1–2 per lead
  actor / primary genre per hand).
- Each scoring term emits a human reason → "why" chips on the card.
- Lock (keep on re-draw) / dismiss (strong penalty) / open / play per card.
- Presets: 盲盒 / 冷门佳作 / 重温最爱 / 短平快 / 演员专场.

### Mixed deck

- Hand of 5; mix switch 只要电影 / 混合 (default) / 演员专场. Mixed = 4 movies +
  at most 1 actor card (falls back to a movie if no actor qualifies).
- Actor eligibility derives from the movie filters: ≥1 matching unwatched film.
  Score = matching-film count + personal rating/favorite + unwatched count.
- Actor eligibility counts only films where they're main cast (first 6
  billed), except actors the user favorited/rated.
- Clicking the actor card opens `/people/{id}` (no film fan — actors can have
  dozens of films; the person page already lists them).

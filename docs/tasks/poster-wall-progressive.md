# Poster Wall — independent progressive loading

Goal: the poster wall must load its own data independently of the movie grid's
scroll state, stream it in progressively (page by page), and have no artificial
500-item cap. Existing tiles must not re-download textures or "pop" as more pages
arrive; sorting via the pills must keep working.

Worktree: `D:/AIworkspace/kubby-poster-wall` (branch `feat/poster-wall-progressive`).
Do NOT touch the sibling `D:/AIworkspace/kubby` checkout.

## Tasks

- [x] **T1 — API: honor explicit `limit` with `offset`.**
  File: `src/app/api/movies/route.ts`. In the standard list path,
  `const pageLimit = offset !== null ? 50 : limit;` forces 50/page whenever an
  offset is present. Change it so that when `offset` is present AND the request
  explicitly sent a `limit` param, that limit is used (clamped to 1..500);
  otherwise keep the 50 default. The grid must be unaffected — it sends `offset`
  with NO `limit`, so it must still get 50/page. Do NOT change the `favorites`
  or `continue-watching` branches.
  Acceptance: `/api/movies?offset=0&limit=200` returns up to 200 items with
  `limit: 200` in the response; `/api/movies?offset=0` still returns `limit: 50`.

- [x] **T2 — Parent: independent progressive fetch.**
  File: `src/app/(main)/movies/page.tsx`, `MoviesTabContent`.
  Rewrite `openPosterWall` so it NEVER reuses the grid's `movies` array. Instead:
  - `setShowPosterWall(true)` and `setWallMovies(null)`.
  - Bump a `useRef` load token; capture it locally.
  - Loop: fetch `/api/movies?<buildMovieParams()>&offset=<o>&limit=200`. After each
    page, if the token no longer matches (wall closed/reopened) abort silently.
    Accumulate mapped `toWallMovie` items and `setWallMovies([...acc])` after every
    page (so the wall mounts on page 1 and grows as pages arrive). Advance
    `o += data.limit`. Stop when `data.hasMore` is false.
  - On error: if nothing loaded yet, `setWallMovies([])` (wall shows empty state);
    otherwise keep what loaded.
  `closePosterWall` must bump the token (to cancel any in-flight loop),
  `setShowPosterWall(false)`, `setWallMovies(null)`.
  Remove the now-unused dependency on `hasNextPage`/`movies` inside `openPosterWall`
  (keep `buildMovieParams`, `toWallMovie`).
  Pass a new `loadingMore` boolean prop to `<PosterWall>` that is true while the
  progressive loop is still running (track via state), so the wall can show a
  subtle indicator.
  Acceptance: opening the wall without scrolling the grid still loads the full
  filtered library; libraries >500 load fully.

- [x] **T3 — Wall: decouple renderer from `movies`; keyed reconciliation.**
  File: `src/components/movie/poster-wall.tsx`.
  - Add `loadingMore?: boolean` to `PosterWallProps`.
  - Add refs that always hold the latest values: `moviesRef` (current movies),
    `sortKeyRef`, `sortOrderRef` (mirror the React sort state each render).
  - Refactor `buildTiles(flow)` into a **reconciling** builder that, given the new
    flow, reuses existing tiles by `key`:
      * Movie tiles keyed by `movie.id`: if a tile with that key already exists,
        REUSE its `mesh`, `material`, `reflMesh`, `reflMaterial`, `texture`,
        `sepTexture(null)`, and current `cur` transform — just update its `item`
        reference. Do NOT dispose or reload its texture.
      * Separator tiles: dispose + recreate (they're cheap; keys are synthetic).
      * Any previously-existing tile whose key is absent from the new flow gets
        removed from the scene and fully disposed (material + texture + sepTexture).
      * Rebuild `tileByMesh` and `pickMeshes` from the new tile list.
      * Brand-new movie tiles: create as today and seed their `cur` from the
        computed target (e.g. `scale: target.scale * 0.9`) so they gently grow in.
        Reused tiles keep their existing `cur` (no pop).
  - Replace `applySort` with a single `rebuild(key, order)` that: builds the flow
    from `moviesRef.current`, remembers the previously focused movie id, reconciles
    tiles, recomputes `newFocus` from that movie id (nudging off separators as the
    current code does), sets `focusFloat`/`targetFocus`, computes targets, seeds
    `cur` for new tiles only, resets `lastHudIndex`, updates HUD, pumps textures,
    and starts the loop (or `renderOnce` under reduced motion). Assign it to
    `rebuildRef` (rename `applySortRef` → `rebuildRef`).
  - The main WebGL `useEffect` should do renderer/scene/closure setup and assign
    `rebuildRef`, but NOT perform the initial build. Keep the early
    `if (isEmpty || !container) return;`. Keep its deps effectively `[isEmpty]`
    (the effect must NOT re-run when `movies` grows).
  - Add a SECOND effect after it: `useEffect(() => { if (!isEmpty)
    rebuildRef.current?.(sortKeyRef.current, sortOrderRef.current); }, [movies])`
    (eslint-disable exhaustive-deps). This runs the first build on mount and
    reconciles on every progressive append.
  - `handleSort` calls `rebuildRef.current?.(key, nextOrder)` (unchanged intent).
  Acceptance: appending pages does not reload already-visible posters and does not
  cause a global pop; changing sort still animates a reorder; focused movie stays
  focused across appends.

- [x] **T4 — Wall: fix large-N hotspots exposed by removing the cap.**
  File: `src/components/movie/poster-wall.tsx`.
  - `updateHover`: only raycast against tiles within a window of the current focus
    (e.g. `RAYCAST_WINDOW = 40` around `clampFocusInt(focusFloat)`), not all tiles.
    Off-window tiles are not visible/interactable anyway.
  - `pump`: eliminate the `tiles.indexOf(tile)` calls inside the loop over `tiles`
    (O(n²)) — iterate with an index and use it directly for the distance/eviction
    logic.
  Acceptance: hover and scroll stay smooth with a few thousand items.

- [x] **T5 — Wall: subtle "loading more" indicator.**
  File: `src/components/movie/poster-wall.tsx`. When `loadingMore` is true, show a
  small spinner (reuse the existing lucide `Loader2` idiom / a tiny glass chip)
  near the top-right by the close button, non-intrusive, `pointer-events-none`.
  It must disappear when loading completes.

## Verify before returning
- `npx tsc --noEmit` clean.
- `npm run build` succeeds.
- Re-read your diff for the reconciliation logic: confirm no path disposes a
  reused tile's texture, and that removed tiles ARE disposed (no leak).

# VR/360 Player Implementation Plan

> Based on `docs/vr-360-player.md` technical spec, with architecture improvements for optimal UX.

---

## Phase 0: Player Refactoring (Pre-requisite)

Current `play/page.tsx` is a 1370-line monolith. Must decompose before adding 360 support.

- [ ] Extract `usePlaybackSession` hook — HLS/direct-play decision, session lifecycle, heartbeat, seek
- [ ] Extract `usePlaybackState` hook — play/pause, currentTime, duration, volume, playback rate
- [ ] Extract `useBookmarks` hook — bookmark CRUD, quick bookmark, detailed bookmark panel state
- [ ] Extract `useProgressSave` hook — auto-save interval (10s), save on exit/disc-change/end
- [ ] Extract `<PlayerControls>` component — seek bar, transport buttons, volume, speed, resolution, fullscreen
- [ ] Extract `<PlayerOverlays>` component — OSD messages, help modal, bookmark panel
- [ ] Refactor `play/page.tsx` to use extracted hooks and components
- [ ] Regression test: direct play, HLS remux, HLS transcode, seek, bookmarks, progress save, keyboard shortcuts, mobile controls

---

## Phase 1: Player-Level 360° Mode Toggle

**Design decision**: 360° mode is a player-level toggle per user, not per-movie detection. Users enable/disable it in the player controls themselves. This avoids detection failures and keeps the implementation simple.

- [x] Add `player_360_mode` to `user_preferences` table (migration #0023)
- [x] GET/PUT `/api/settings/personal-metadata` supports `player360Mode`
- [x] 360° toggle button in PlayerControls (bottom bar, next to auto-hide)
- [x] State synced from user preferences on load, persisted on toggle
- [x] i18n keys for player.mode360/mode360On/mode360Off (en/zh)

---

## Phase 2: Basic 360 Rendering

- [x] Install `three` and `@types/three`
- [x] Create `src/components/player/panorama-360-player.tsx`:
  - Three.js Scene with inverted `SphereGeometry` (500, 60, 40) + BackSide material
  - `PerspectiveCamera` at origin (FOV 75)
  - `VideoTexture` from hidden `<video>` element
  - `WebGLRenderer` with `pixelRatio` capped at 2
  - `ResizeObserver` for responsive canvas
  - Proper `dispose()` cleanup on unmount
- [x] Mouse/touch drag to rotate camera (Pointer Events)
- [x] Scroll wheel FOV zoom (range 30°–120°)
- [x] SSR handling: `dynamic(() => import(...), { ssr: false })`
- [x] Conditional rendering: `is360Mode` → `<Panorama360Player>` else standard `<video>`
- [x] Three.js code-split into separate chunk (~500KB), lazy-loaded

---

## Phase 3: HLS & Controls Integration

- [ ] Wire `usePlaybackSession` hook into `Panorama360Player` (hidden `<video>` as HLS target)
- [ ] Wire `usePlaybackState` hook for shared play/pause/seek/volume state
- [ ] Mount shared `<PlayerControls>` as overlay on Three.js canvas
- [ ] Add 360-specific control buttons:
  - Reset view (recenter to initial orientation)
  - Compass indicator (small circle showing current heading)
  - Gyroscope toggle (default off)
- [ ] Handle seek UX: keep last frame rendered in Three.js while rebuffering (scene remains rotatable)
- [ ] Wire `useProgressSave` hook — auto-save works identically
- [ ] Wire `useBookmarks` hook — bookmarks work identically
- [ ] Transcode aspect ratio: verify 2:1 ratio preserved when scaling 360 content (current `-2` flag should handle this)

---

## Phase 4: Mobile & Gyroscope

- [ ] Touch drag rotation (already covered by Pointer Events from Phase 2)
- [ ] Pinch-to-zoom gesture for FOV control on touchscreens
- [ ] Implement `useGyroscope` hook:
  - `DeviceOrientationEvent` listener
  - iOS 13+ `requestPermission()` flow triggered by user gesture
  - Coordinate system mapping (device orientation -> camera quaternion)
- [ ] Gyroscope toggle button in controls (hidden on desktop, visible on mobile)
- [ ] Inertia animation: velocity-based decay on pointer release
- [ ] Mobile performance adaptation:
  - Detect low-end devices via FPS monitoring (`requestAnimationFrame` delta)
  - Reduce sphere segments (60x40 -> 32x24) on low-end
  - Reduce `pixelRatio` to 1 on low-end
  - Pause render loop when video is paused

---



---

## Future Extensions (Not in current scope)

- [ ] 180 degree video support (half-sphere rendering)
- [ ] SBS (side-by-side) stereo 3D mode
- [ ] TB (top-bottom) stereo 3D mode
- [ ] WebXR headset support (Quest / Vision Pro)
- [ ] Cubemap projection format
- [ ] Spatial audio (ambisonics) rotation tied to camera direction

---

## Technical Notes

### Bundle Size Strategy
- `three` ~150 KB gzip — only loaded on 360 playback pages via dynamic import + code splitting
- `hls.js` ~70 KB — already in project, no additional cost
- Total incremental cost for 360: ~150 KB, lazy-loaded

### Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Player refactoring regression | Broken playback | Incremental extraction, test each hook independently |
| Three.js SSR crash | Build failure | `dynamic import` + `ssr: false` + import inside `useEffect` |
| iOS Safari WebGL perf | Choppy 4K 360 | FPS monitoring + auto-downgrade + lower HLS resolution option |
| HLS seek black frame | Bad UX during seek | Keep Three.js scene rotatable with frozen last frame + spinner |
| 360 videos without metadata | Missed detection | Manual toggle in MetadataEditor + heuristic (2:1 ratio) fallback |

### Key Files to Modify

| File | Changes |
|------|---------|
| `src/lib/db/schema.ts` | Add spherical columns |
| `src/lib/scanner/probe.ts` | Add `detectSpherical()` |
| `src/lib/scanner/index.ts` | Call `detectSpherical()` during scan |
| `src/app/(main)/movies/[id]/play/page.tsx` | Refactor into hooks + conditional 360 render |
| `src/components/player/panorama-360-player.tsx` | New — Three.js 360 player |
| `src/components/player/player-controls.tsx` | New — extracted shared controls |
| `src/components/player/hooks/*.ts` | New — extracted shared hooks |

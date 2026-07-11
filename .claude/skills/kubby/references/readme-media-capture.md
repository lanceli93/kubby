# README media capture — screenshots, screen recordings, GIF/WebP

How to (re)generate the images and animated demos in `README.md` / `README.zh-CN.md`
(assets live in `docs/screenshots/`). Windows + local ffmpeg + chrome-devtools MCP.

## Golden rules (learned the hard way)

- **Output format = animated WebP, not GIF.** Same clip is 5–10× smaller and GitHub
  renders animated WebP in `![]()`/`<img>` fine. The whole README media set went
  **~91MB → ~10MB** doing this. Static shots → WebP too.
- **Both READMEs share the same image files.** So all captures must be ONE language.
  The originals were English → capture in English (`NEXT_LOCALE=en` cookie).
- **Compress the user's own footage, never re-record it** (e.g. the hand-shot
  `mobile-vr-360` phone clip). Only re-record app UI.
- **Recording target = a PRODUCTION build on :8665, not `npm run dev`.** Dev has
  per-route compile lag that shows up on camera. But `next build` writes to `.next/`
  which a running dev server shares → **stop the dev server first** (`taskkill //PID
  <pid> //T //F`), then `npm run build`, then `PORT=8665 npm run start`. `next start`
  works despite the `output: standalone` warning (static assets still 200).
- **No `KUBBY_DATA_DIR` set → prod on :8665 uses the same `./data/kubby.db` as dev.**
  So seeded demo data and the test library carry straight over. Verify with
  `src/lib/paths.ts` (`process.cwd()/data`).

## ffmpeg is the engine (`d:/GeneralTools/ffmpeg...`, has ddagrab/libwebp/x264)

### Screen recording — use `ddagrab` (Desktop Duplication), NOT gdigrab window-capture
- gdigrab `-i title="..."` returns a **blank white** frame for Chrome (GPU surface
  isn't readable by GDI BitBlt). gdigrab `-i desktop` works but grabs all monitors.
- `ddagrab=0` reads the primary monitor's composited framebuffer cleanly (catches
  Chrome's GPU content). Output 0 = primary 4K (3840×2160 here).
- **CRITICAL: add `:framerate=30` to ddagrab** or it BLOCKS on a static screen
  (Desktop Duplication only emits a frame on change; a still page → ffmpeg hangs
  until timeout). This bit both single-frame grabs and recordings of non-animating
  pages. Always: `ddagrab=0:framerate=30`.
- **Maximize the Chrome window first** (Win32 `ShowWindow(h, 3)` via PowerShell) so
  the crop is deterministic, then **crop out the browser chrome**. At 150% DPI /
  4K, the content region below the omnibox is `crop=3840:1950:0:138` (w:h:x:y).
  Re-measure with a single grab if DPI/monitor differs.
- Record helper (reused across all demos):
  ```bash
  ffmpeg -y -hide_banner -loglevel error \
    -init_hw_device d3d11va \
    -filter_complex "ddagrab=0:framerate=30,hwdownload,format=bgra,crop=3840:1950:0:138" \
    -t "$SECS" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$OUT.mp4"
  ```

### mp4 → animated WebP
```bash
ffmpeg -y -i "$IN.mp4" -vcodec libwebp \
  -filter:v "fps=$F,scale=$W:-1:flags=lanczos" \
  -lossless 0 -qscale $Q -compression_level 6 -loop 0 "$OUT.webp"
```
- Size knobs, in order of impact: **clip length** (trim to ~9s — a README demo
  doesn't need 15s), then **fps** (10–14 is plenty for stepped/UI motion), then
  **width** (900–1100), then **qscale** (46–60).
- Rough results: mostly-dark UI page ~0.9–1.8MB; full-frame detail motion (mosaic
  wall / cover flow, hardest case) ~2MB; simple dialogs <200KB.

### GIF → WebP (compressing user footage)
```bash
ffmpeg -y -i in.gif -vcodec libwebp -filter:v "fps=14,scale=360:-1:flags=lanczos" \
  -lossless 0 -qscale 55 -compression_level 6 -loop 0 out.webp
```

### Verify a WebP is a valid animation
ffmpeg's animated-WebP **decoder is buggy** — it can't read back its own output
(`image data not found`). That is NOT proof the file is bad. Verify with Pillow via
uv (`use uv for python` per user rules; webp CLI tools aren't installed):
```bash
uv run --with pillow python -c "import sys;from PIL import Image;im=Image.open(sys.argv[1]);print(im.size,im.is_animated,im.n_frames);im.seek(im.n_frames//2);im.convert('RGB').save(sys.argv[2])" out.webp frame.png
```

## Static screenshots — chrome-devtools MCP (clean, no cursor, deterministic)
- Global rule: drive the already-logged-in Chrome via chrome-devtools MCP with
  `--autoConnect` — `list_pages` then `select_page`; don't launch a blank browser.
  If `list_pages` fails with `DevToolsActivePort`, it's usually a transient race —
  retry; confirm Chrome is up with a debug port (`netstat | grep :9222`).
- `take_screenshot({format:"webp", quality:90, filePath})` = clean viewport, no
  browser chrome, no mouse. `resize_page(1440, 860)` first for consistent framing.
  The MCP tool is sandboxed to the workspace root — `filePath` must be **inside the
  repo** (e.g. a temp `./.capture-tmp/`), NOT `$CLAUDE_JOB_DIR` or another drive, or
  it errors with "not within any of the configured workspace roots". Output is a
  retina 2× webp (2162×1292 at this DPI) — same size as the existing static shots,
  so re-encode through libwebp (`-qscale 82`) to shrink but don't upscale/resize.
- Switch UI to English: `evaluate_script` → `document.cookie="NEXT_LOCALE=en;
  path=/; max-age=31536000"` then `navigate_page({type:"reload"})`.
- **Blurring private photo pixels (photos domain uses the user's own photos).**
  Inject a style that blurs only image content, leaving all UI chrome sharp:
  `<style id=kubby-privacy-blur> img { filter: blur(20px)!important } nextjs-portal
  { display:none!important } </style>`. `blur(18-24px)` makes faces unrecognizable
  while poster/tile shapes still read. Gotchas: (1) the `<style>` is **wiped on every
  `navigate_page`** — re-inject after each nav (and after opening a route-based
  lightbox); (2) blur `img` broadly, not `main img` — lightboxes/dialogs portal
  outside `<main>`; (3) check the EXIF/info panel text for GPS/location before
  shooting (Kubby's only shows filename/date/dims/size — safe); (4) the Next.js dev
  "N" button (`nextjs-portal`, bottom-left) must be hidden or it shows in prod-less
  dev shots. The music domain uses commercial cover art → no blur needed.
- **Seeding demo data** for empty features (e.g. Photos had no albums): POST through
  the real APIs from the browser (carries the session cookie) with neutral public
  names, shoot, then **DELETE what you created** to leave the user's test library as
  you found it. All writes land in the gitignored test library.

## Driving animation during a recording
CDP `press_key` / `click` round-trips are too slow to animate live (≈1 call/turn).
Instead: **start the background recording, then fire ONE `evaluate_script` that runs
a self-contained `setInterval`/async loop** driving the UI for the whole window.
- Cover Flow poster wall listens for `keydown` on **`window`** — drive it with
  `window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`
  on a ~850ms timer. (It's a `<canvas>`; wheel/pointer/keydown, no a11y nodes.)
- Search: category tabs are plain buttons — click them by text content on a timer.
  Programmatic typing into the React search box needs the native value setter +
  `input` event; but the results view can reset on URL nav, so prefer navigating to
  `?q=...` and then recording tab clicks.
- Mosaic wall & 360: **autonomous** (drift/spotlight animate on their own) — just
  record, no interaction.

## Seeding demo data (many "what Kubby adds" shots need user data that a fresh
## scrape doesn't have: ratings, bookmarks, galleries)
Do it through the real APIs from the browser (carries the session cookie), then
screenshot the authentic result. All writes land in the gitignored test library —
they don't touch real media.
- **Rating dimensions** must exist first: Preferences → Ratings & Bookmarks, add
  movie dims (Plot/Cinematography/Soundtrack/Acting) + person dims
  (Appearance/Acting Skill). Auto-saves via API.
- **Movie ratings:** `PUT /api/movies/{id}/user-data` with
  `{personalRating, dimensionRatings:{Dim:score,...}}` (0–5, 0.1 steps).
- **Person ratings:** `PUT /api/people/{id}/user-data`, same shape with person dims.
- **Actor gallery:** drop varied-aspect JPGs (mix landscape fanart + portrait
  posters → nice justified rows) into
  `data/metadata/people/<L>/<Name>/gallery/NNN.jpg`; GET reconciles `order.json`.
- **Bookmarks:** rows in `movie_bookmarks` (icon_type ∈ bookmark/star/action/music/
  dialogue/funny/emotion/visual/suspense; `tags` = JSON array; `note`; timestamps).
  `thumbnail_path` is an ABSOLUTE path `{bookmarksDir}/{userId}/{movieId}/{id}.jpg`
  and the thumbnail file must be named `{bookmarkId}.jpg`.
- **Bookmark Mode frame scrubber** starts BLACK; the frame only loads after a seek.
  Use the "Jump to Time" input + "Go" (or drag the seek bar) to trigger
  `GET /api/movies/{id}/frame?t=SECONDS` — then "+ Add Bookmark" enables and the
  frame renders.

## Gotchas
- **WAL visibility:** a read-only `better-sqlite3` connection opened separately can
  see a STALE snapshot right after a UI write (e.g. rating dims looked empty). Do
  `db.pragma("wal_checkpoint(FULL)")` or reuse the app's connection before asserting
  a write landed.
- **Stale cached thumbnails:** bookmark thumbnails are cached JPGs, so after
  regenerating the test videos (see `test-media/generate.sh`, timer clips) OLD
  bookmarks still show OLD frames. Delete + recreate bookmarks, re-extracting frames
  from the NEW video at each timestamp (`ffmpeg -ss T -i video -frames:v 1 -vf
  scale=640:-2`).
- **CDP `press_key("F11")` and JS `requestFullscreen()` don't hold** OS fullscreen
  from automation. Use a maximized window + crop instead.
- **`take_screenshot` and `Read` of PNGs are context-heavy** — batch/limit them;
  extract downscaled verify frames (`scale=700:-1`) rather than full 4K.

## Wrap-up checklist
1. New assets in `docs/screenshots/*.webp`; verify each ref resolves:
   `grep -oE 'docs/screenshots/[^)]+' README*.md` → all `.webp`, all exist.
2. Both READMEs updated (EN + 中文, same files), including any NEW feature sections.
3. `git rm` the now-unused old `.gif`/`.png`; remove orphan webp not referenced.
4. Commit (email-privacy identity per user CLAUDE.md). Restore state: restart
   `npm run dev` on :3000, flip locale back if desired.

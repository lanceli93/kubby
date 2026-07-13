/**
 * build-demo-assets.ts — DEV-ONLY, run once, output is committed.
 *
 * Kubby's live test data (`test-media/`, `test-tv-media/`, `data/*`) is all
 * gitignored, so a fresh install has none of it. Demo Mode needs media it can
 * ship inside the repo + packaged build, so this script distills the dev's
 * local test data into a small, committed `demo-assets/` bundle:
 *
 *   - Cinema: every movie's movie.nfo + poster + fanart (NO video committed).
 *   - TV: every show's tvshow.nfo + posters + .stills/ (episode thumbs), and a
 *     manifest of the real episode video slots (NO video committed).
 *   - Photos: a handful of movie fanart/poster JPGs reused as a photo album.
 *   - Music: license-safe SYNTHETIC ffmpeg tone tracks (AAC/m4a) with embedded
 *     tags + a folder cover.jpg reusing movie posters (no copyrighted audio/art).
 *   - people/ + tv-people/: only the cast photos actually referenced by the
 *     committed NFOs (parsed from <thumb> paths) — trims unused actors.
 *   - ONE placeholder.mp4 (smallest test clip) — the seeder copies it into every
 *     movie/episode folder at runtime, so we never store 30+ videos in git.
 *   - manifest.json — library names + the TV episode video slots the seeder needs.
 *
 * Usage:  npx tsx scripts/build-demo-assets.ts
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const TEST_MEDIA = path.join(ROOT, "test-media");
const TEST_TV = path.join(ROOT, "test-tv-media");
const METADATA = path.join(ROOT, "data", "metadata");
const OUT = path.join(ROOT, "demo-assets");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

// Trim the cinema set to keep the downloadable pack small (~15 MB). The music
// albums reuse these movies' posters as covers, so those titles MUST survive.
const CINEMA_LIMIT = 15;
const MUSIC_COVER_MOVIES = ["Blade Runner 2049 (2017)", "La La Land (2016)", "Interstellar (2014)"];

const VIDEO_EXT = new Set([".mp4", ".mkv", ".avi", ".wmv", ".mov", ".flv", ".webm", ".m4v", ".ts", ".rmvb", ".rm"]);

function log(msg: string) {
  console.log(`[demo-assets] ${msg}`);
}

function rmrf(p: string) {
  fs.rmSync(p, { recursive: true, force: true });
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src: string, dest: string) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/** Copy every non-video file in a source dir (posters, nfo) to dest. */
function copyMetaFiles(srcDir: string, destDir: string) {
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) continue;
    if (VIDEO_EXT.has(path.extname(name).toLowerCase())) continue; // strip video
    copyFile(src, path.join(destDir, name));
  }
}

/** Parse absolute <thumb> paths out of an NFO's XML text. */
function extractThumbPaths(nfoText: string): string[] {
  const out: string[] = [];
  const re = /<thumb>([^<]+)<\/thumb>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(nfoText))) {
    const raw = m[1].trim();
    if (raw && !raw.startsWith("http")) out.push(raw);
  }
  return out;
}

/** Strip trailing dots/spaces from each path segment. Git on Windows CANNOT
 *  commit files inside a directory whose name ends in "." or " " (e.g. an actor
 *  named "Duane Evans Jr."), so such photos would silently drop from the bundle.
 *  We normalize the leaf dir names in the bundle AND rewrite the matching NFO
 *  <thumb> tails to match — the seeder re-roots the tail verbatim, and the
 *  scanner keys photo import off the (existing) thumb file, so this stays
 *  consistent at runtime on both Windows and Linux. */
function gitSafeTail(tail: string): string {
  return tail
    .split(/[\\/]/)
    .map((seg) => seg.replace(/[. ]+$/, ""))
    .join("/");
}

/** Copy an actor photo referenced by an NFO thumb into the demo people bundle,
 *  preserving a git-safe `.../metadata/(people|tv-people)/...` tail so the seeder
 *  can re-root it. Returns silently if the source file is missing. */
function copyReferencedPhoto(absThumb: string) {
  const idx = absThumb.search(/metadata[\\/](?:tv-people|people)[\\/]/i);
  if (idx < 0) return;
  const tail = absThumb.slice(idx + "metadata".length + 1); // "people/K/Keanu Reeves/photo.jpg"
  const src = path.join(METADATA, tail.replace(/\\/g, path.sep));
  if (!fs.existsSync(src)) return;
  copyFile(src, path.join(OUT, gitSafeTail(tail).replace(/\//g, path.sep)));
}

/** Rewrite a committed NFO's local <thumb> paths so their person-dir segment is
 *  git-safe, matching where copyReferencedPhoto placed the photo. */
function gitSafeNfoThumbs(nfoPath: string) {
  if (!fs.existsSync(nfoPath)) return;
  const text = fs.readFileSync(nfoPath, "utf-8");
  const rewritten = text.replace(/<thumb>([^<]+)<\/thumb>/g, (full, raw: string) => {
    const val = raw.trim();
    if (!val || val.startsWith("http")) return full;
    const idx = val.search(/metadata[\\/]/i);
    if (idx < 0) return full;
    const head = val.slice(0, idx + "metadata".length + 1); // ".../metadata/" (keep dev prefix; seeder re-roots)
    const tail = gitSafeTail(val.slice(idx + "metadata".length + 1)).replace(/\//g, "\\");
    return `<thumb>${head}${tail}</thumb>`;
  });
  if (rewritten !== text) fs.writeFileSync(nfoPath, rewritten);
}

// ─── Cinema ─────────────────────────────────────────────────────
function buildCinema(): void {
  log("Cinema: distilling movies…");
  const dest = path.join(OUT, "cinema");

  // All movie dirs (have a movie.nfo), then pick the CINEMA_LIMIT set — always
  // including the music-cover movies, then filling with the rest alphabetically
  // so the pack is deterministic across rebuilds.
  const allMovies = fs
    .readdirSync(TEST_MEDIA)
    .filter((name) => {
      const srcDir = path.join(TEST_MEDIA, name);
      return fs.statSync(srcDir).isDirectory() && fs.existsSync(path.join(srcDir, "movie.nfo"));
    })
    .sort();
  const required = MUSIC_COVER_MOVIES.filter((m) => allMovies.includes(m));
  const rest = allMovies.filter((m) => !required.includes(m));
  const chosen = [...required, ...rest].slice(0, Math.max(CINEMA_LIMIT, required.length));

  let count = 0;
  for (const name of chosen) {
    const srcDir = path.join(TEST_MEDIA, name);
    const destDir = path.join(dest, name);
    copyMetaFiles(srcDir, destDir);
    // Copy only the actor photos this movie references.
    const nfo = fs.readFileSync(path.join(srcDir, "movie.nfo"), "utf-8");
    for (const t of extractThumbPaths(nfo)) copyReferencedPhoto(t);
    gitSafeNfoThumbs(path.join(destDir, "movie.nfo"));
    count++;
  }
  log(`Cinema: ${count} movies (limit ${CINEMA_LIMIT}, incl. ${required.length} music-cover titles).`);
}

// ─── TV ─────────────────────────────────────────────────────────
type EpisodeSlot = { season: string; base: string };
function buildTv(): Record<string, EpisodeSlot[]> {
  log("TV: distilling shows…");
  const dest = path.join(OUT, "tv");
  const episodes: Record<string, EpisodeSlot[]> = {};
  for (const show of fs.readdirSync(TEST_TV)) {
    const srcDir = path.join(TEST_TV, show);
    if (!fs.statSync(srcDir).isDirectory()) continue;
    if (!fs.existsSync(path.join(srcDir, "tvshow.nfo"))) continue;
    const showDest = path.join(dest, show);
    // Top-level meta (tvshow.nfo, poster.jpg, fanart.jpg, seasonNN-poster.jpg).
    copyMetaFiles(srcDir, showDest);
    // .stills/ — per-episode thumbnails the scanner links as episode stills.
    const stills = path.join(srcDir, ".stills");
    if (fs.existsSync(stills)) {
      for (const s of fs.readdirSync(stills)) copyFile(path.join(stills, s), path.join(showDest, ".stills", s));
    }
    // Enumerate the real episode video slots (season folder + basename).
    const slots: EpisodeSlot[] = [];
    for (const entry of fs.readdirSync(srcDir)) {
      const seasonDir = path.join(srcDir, entry);
      if (!fs.statSync(seasonDir).isDirectory()) continue;
      if (!/^season|specials/i.test(entry)) continue;
      for (const f of fs.readdirSync(seasonDir)) {
        if (!VIDEO_EXT.has(path.extname(f).toLowerCase())) continue;
        slots.push({ season: entry, base: path.basename(f, path.extname(f)) });
      }
    }
    episodes[show] = slots;
    // Copy referenced cast photos from tvshow.nfo.
    const nfo = fs.readFileSync(path.join(srcDir, "tvshow.nfo"), "utf-8");
    for (const t of extractThumbPaths(nfo)) copyReferencedPhoto(t);
    gitSafeNfoThumbs(path.join(showDest, "tvshow.nfo"));
  }
  log(`TV: ${Object.keys(episodes).length} shows, ${Object.values(episodes).flat().length} episode slots.`);
  return episodes;
}

// ─── Photos ─────────────────────────────────────────────────────
// Reuse a spread of movie fanart/posters as a demo photo album.
function buildPhotos(): void {
  log("Photos: reusing movie art…");
  const dest = path.join(OUT, "photos", "Demo Gallery");
  ensureDir(dest);
  const cinema = path.join(OUT, "cinema");
  const dirs = fs.existsSync(cinema) ? fs.readdirSync(cinema) : [];
  let n = 0;
  for (const d of dirs) {
    if (n >= 18) break;
    const fanart = path.join(cinema, d, "fanart.jpg");
    const poster = path.join(cinema, d, "poster.jpg");
    if (fs.existsSync(fanart)) {
      copyFile(fanart, path.join(dest, `${String(n).padStart(2, "0")}-${d}-wide.jpg`));
      n++;
    }
    if (n < 18 && fs.existsSync(poster)) {
      copyFile(poster, path.join(dest, `${String(n).padStart(2, "0")}-${d}-poster.jpg`));
      n++;
    }
  }
  log(`Photos: ${n} images.`);
}

// ─── Music (synthetic, license-safe) ────────────────────────────
type DemoAlbum = { title: string; artist: string; year: number; cover: string; tracks: string[] };
const MUSIC_ALBUMS: DemoAlbum[] = [
  { title: "Neon Skyline", artist: "The Prototypes", year: 2021, cover: "Blade Runner 2049 (2017)", tracks: ["Ignition", "Skyline Drift", "Chrome Rain", "Afterglow"] },
  { title: "Midnight Reverie", artist: "Aria Vance", year: 2019, cover: "La La Land (2016)", tracks: ["Reverie", "Slow Lights", "Paper Moon", "Encore"] },
  { title: "Analog Dreams", artist: "The Prototypes", year: 2023, cover: "Interstellar (2014)", tracks: ["Tape Warmth", "Signal Path", "Reel to Reel", "Fade Out"] },
];

function buildMusic(): void {
  log("Music: generating synthetic tone tracks…");
  const dest = path.join(OUT, "music");
  const cinema = path.join(OUT, "cinema");
  let freq = 220;
  for (const album of MUSIC_ALBUMS) {
    const albumDir = path.join(dest, `${album.artist} - ${album.title}`);
    ensureDir(albumDir);
    // Folder-level cover.jpg (scanner prefers this over embedded art).
    const coverSrc = path.join(cinema, album.cover, "poster.jpg");
    if (fs.existsSync(coverSrc)) copyFile(coverSrc, path.join(albumDir, "cover.jpg"));
    album.tracks.forEach((title, i) => {
      const trackNo = i + 1;
      freq = 180 + ((freq * 1.5 + trackNo * 40) % 400); // vary pitch per track
      const outFile = path.join(albumDir, `${String(trackNo).padStart(2, "0")} - ${title}.m4a`);
      // A short pleasant-ish tone; embedded iTunes-style tags for the scanner.
      execFileSync(FFMPEG, [
        "-y", "-f", "lavfi", "-i", `sine=frequency=${Math.round(freq)}:duration=12`,
        "-af", "afade=t=in:d=0.5,afade=t=out:st=11:d=1,volume=0.4",
        "-c:a", "aac", "-b:a", "128k",
        "-metadata", `title=${title}`,
        "-metadata", `artist=${album.artist}`,
        "-metadata", `album_artist=${album.artist}`,
        "-metadata", `album=${album.title}`,
        "-metadata", `track=${trackNo}/${album.tracks.length}`,
        "-metadata", `date=${album.year}`,
        "-metadata", "genre=Electronic",
        outFile,
      ], { stdio: "ignore" });
    });
    log(`  ${album.artist} — ${album.title}: ${album.tracks.length} tracks.`);
  }
}

// ─── placeholder video ──────────────────────────────────────────
function buildPlaceholder(): void {
  // Reuse the smallest committed test clip if present; otherwise synthesize one.
  const candidates = [
    path.join(TEST_MEDIA, "The Shawshank Redemption (1994)", "The Shawshank Redemption (1994).mp4"),
  ];
  const out = path.join(OUT, "placeholder.mp4");
  const found = candidates.find((c) => fs.existsSync(c));
  if (found) {
    copyFile(found, out);
    log(`placeholder.mp4 ← ${path.relative(ROOT, found)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
    return;
  }
  log("No test clip found — synthesizing placeholder.mp4 via ffmpeg…");
  execFileSync(FFMPEG, [
    "-y", "-f", "lavfi", "-i", "color=c=0x0e0e16:s=1280x720:d=10:r=30",
    "-f", "lavfi", "-i", "sine=frequency=220:duration=10",
    "-vf", "drawtext=text='Kubby Demo':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
  ], { stdio: "ignore" });
}

// ─── main ───────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(TEST_MEDIA)) throw new Error(`Missing ${TEST_MEDIA} — run this on a dev box with test data.`);
  log(`Rebuilding ${path.relative(ROOT, OUT)}/ …`);
  rmrf(OUT);
  ensureDir(OUT);

  buildCinema();
  const tvEpisodes = buildTv();
  buildPhotos();
  buildMusic();
  buildPlaceholder();

  const manifest = {
    version: 1,
    placeholder: "placeholder.mp4",
    libraries: {
      cinema: "Demo Movies",
      tv: "Demo TV Shows",
      photos: "Demo Photos",
      music: "Demo Music",
    },
    // Cinema video slot is deterministic (`<movieDir>.mp4`); only TV needs an
    // explicit slot list because no episode videos are committed.
    tvEpisodes,
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  log("Wrote manifest.json.");

  packTarball();

  log("Done. Commit demo-assets/ (authoring source) and upload demo-assets.tar.gz to the");
  log("  'demo-assets' GitHub release:  gh release upload demo-assets demo-assets.tar.gz --clobber");
}

/**
 * Pack the built tree into `demo-assets.tar.gz` — the single artifact uploaded
 * to the GitHub release and downloaded on demand by Demo Mode. `--force-local`
 * stops GNU tar treating the Windows `D:` path as a remote host.
 */
function packTarball(): void {
  const tarball = path.join(ROOT, "demo-assets.tar.gz");
  log("Packing demo-assets.tar.gz…");
  execFileSync("tar", ["--force-local", "-czf", tarball, "-C", OUT, "."], { stdio: "ignore" });
  const mb = fs.statSync(tarball).size / 1024 / 1024;
  log(`Wrote ${path.relative(ROOT, tarball)} (${mb.toFixed(1)} MB).`);
}

main();

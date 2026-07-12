/**
 * Demo Mode seeder.
 *
 * Materializes the committed, read-only `demo-assets/` bundle into the writable
 * data dir, then drives the REAL scanner over it so every domain populates
 * exactly as a normal library would (no forked write path).
 *
 * Why materialize instead of scanning the bundle in place:
 *   - the bundle ships no video files (one placeholder is copied into every
 *     movie/episode slot here — we don't store 30+ clips in git);
 *   - the packaged bundle dir may be read-only;
 *   - NFO <thumb> actor-photo paths are absolute + machine-specific, so they
 *     must be rewritten to this install's metadata dir.
 *
 * The 4 libraries are flagged `isDemo` — the allowlist the clear/reset paths key
 * on. Seeding runs behind the same first-run guard as normal setup.
 */
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { mediaLibraries } from "@/lib/db/schema";
import { scanLibrary } from "@/lib/scanner";
import { getDemoAssetsDir, getDemoDir, getMetadataDir } from "@/lib/paths";

type Manifest = {
  version: number;
  placeholder: string;
  libraries: { cinema: string; tv: string; photos: string; music: string };
  tvEpisodes: Record<string, { season: string; base: string }[]>;
};

export type DemoPhase = "prepare" | "cinema" | "tv" | "photos" | "music" | "done";
export type DemoProgress = { phase: DemoPhase; current: number; total: number; title: string };

function readManifest(): Manifest {
  const p = path.join(getDemoAssetsDir(), "manifest.json");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

/**
 * Rewrite every absolute `<thumb>…\metadata\(people|tv-people)\…>` path in an
 * NFO to point at THIS install's metadata dir, normalizing separators for the
 * host OS. The committed bundle carries the dev machine's absolute paths, which
 * don't exist here; the referenced photos were copied into metadata/ in prepare.
 */
function rewriteNfoThumbs(nfoPath: string) {
  let text: string;
  try {
    text = fs.readFileSync(nfoPath, "utf-8");
  } catch {
    return;
  }
  const metaDir = getMetadataDir();
  const rewritten = text.replace(/<thumb>([^<]*)<\/thumb>/g, (full, raw: string) => {
    const val = raw.trim();
    if (!val || val.startsWith("http")) return full;
    const idx = val.search(/metadata[\\/]/i);
    if (idx < 0) return full;
    const tail = val.slice(idx + "metadata".length + 1).replace(/[\\/]/g, path.sep);
    return `<thumb>${path.join(metaDir, tail)}</thumb>`;
  });
  if (rewritten !== text) fs.writeFileSync(nfoPath, rewritten);
}

/** Recursively copy a bundle subtree into the data dir (merges into existing). */
function copyTree(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

/** Copy the placeholder clip into a target video path (creating parents). */
function placeVideo(placeholderSrc: string, destPath: string) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(placeholderSrc, destPath);
}

async function seedDomain(
  type: "movie" | "tvshow" | "photo" | "music",
  name: string,
  folderPath: string,
  onProgress: (p: DemoProgress) => void,
  phase: DemoPhase,
): Promise<void> {
  const id = uuid();
  db.insert(mediaLibraries)
    .values({
      id,
      name,
      type,
      folderPath: JSON.stringify([folderPath]),
      // Demo libs read in place, use bundled NFO/artwork, never scrape or write NFO.
      scraperEnabled: false,
      jellyfinCompat: type === "movie" || type === "tvshow",
      isDemo: true,
    })
    .run();
  await scanLibrary(id, (p) => onProgress({ phase, current: p.current, total: p.total, title: p.title }));
}

export async function seedDemo(onProgress: (p: DemoProgress) => void = () => {}): Promise<void> {
  const assets = getDemoAssetsDir();
  const demoRoot = getDemoDir();
  const manifest = readManifest();
  const placeholder = path.join(assets, manifest.placeholder);

  onProgress({ phase: "prepare", current: 0, total: 1, title: "Preparing demo assets" });

  // 1. Actor photos → this install's metadata dir (so rewritten thumbs resolve).
  copyTree(path.join(assets, "people"), path.join(getMetadataDir(), "people"));
  copyTree(path.join(assets, "tv-people"), path.join(getMetadataDir(), "tv-people"));

  // 2. Materialize each domain subtree into the writable demo dir.
  fs.mkdirSync(demoRoot, { recursive: true });
  const cinemaDir = path.join(demoRoot, "cinema");
  const tvDir = path.join(demoRoot, "tv");
  const photosDir = path.join(demoRoot, "photos");
  const musicDir = path.join(demoRoot, "music");
  copyTree(path.join(assets, "cinema"), cinemaDir);
  copyTree(path.join(assets, "tv"), tvDir);
  copyTree(path.join(assets, "photos"), photosDir);
  copyTree(path.join(assets, "music"), musicDir);

  // 2a. Cinema: one placeholder video per movie folder + rewrite NFO thumbs.
  if (fs.existsSync(cinemaDir)) {
    for (const movie of fs.readdirSync(cinemaDir)) {
      const dir = path.join(cinemaDir, movie);
      if (!fs.statSync(dir).isDirectory()) continue;
      placeVideo(placeholder, path.join(dir, `${movie}.mp4`));
      rewriteNfoThumbs(path.join(dir, "movie.nfo"));
    }
  }

  // 2b. TV: placeholder per episode slot (from manifest) + rewrite show NFOs.
  for (const [show, slots] of Object.entries(manifest.tvEpisodes)) {
    const showDir = path.join(tvDir, show);
    if (!fs.existsSync(showDir)) continue;
    rewriteNfoThumbs(path.join(showDir, "tvshow.nfo"));
    for (const slot of slots) {
      placeVideo(placeholder, path.join(showDir, slot.season, `${slot.base}.mp4`));
    }
  }

  // 3. Scan each domain via the real scanner.
  await seedDomain("movie", manifest.libraries.cinema, cinemaDir, onProgress, "cinema");
  await seedDomain("tvshow", manifest.libraries.tv, tvDir, onProgress, "tv");
  await seedDomain("photo", manifest.libraries.photos, photosDir, onProgress, "photos");
  await seedDomain("music", manifest.libraries.music, musicDir, onProgress, "music");

  onProgress({ phase: "done", current: 1, total: 1, title: "Demo ready" });
}

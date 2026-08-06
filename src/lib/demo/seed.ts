/**
 * Demo Mode seeder.
 *
 * Resolves the demo asset bundle (local committed tree on a dev box, else a
 * ~15 MB pack downloaded from a GitHub release — see fetch-assets.ts), then
 * materializes it into the writable data dir and drives the REAL scanner over
 * it so every domain populates exactly as a normal library would (no forked
 * write path).
 *
 * Why materialize instead of scanning the bundle in place:
 *   - the bundle ships no video files (one placeholder is copied into every
 *     movie/episode slot here — we don't store 15 clips in git);
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
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  mediaLibraries,
  movies,
  people,
  moviePeople,
  userMovieData,
  userPersonData,
  userPreferences,
} from "@/lib/db/schema";
import { scanLibrary } from "@/lib/scanner";
import { getDemoDir, getMetadataDir } from "@/lib/paths";
import { ensureDemoAssets } from "./fetch-assets";

type Manifest = {
  version: number;
  placeholder: string;
  libraries: { cinema: string; tv: string; photos: string; music: string };
  tvEpisodes: Record<string, { season: string; base: string }[]>;
  vr?: string;        // bundle-relative path to the VR clip (e.g. "vr.mp4")
  vrMovie?: string;   // cinema folder name that should get the VR clip
};

export type DemoPhase = "download" | "prepare" | "cinema" | "tv" | "photos" | "music" | "done";
export type DemoProgress = { phase: DemoPhase; current: number; total: number; title: string };

function readManifest(assetsDir: string): Manifest {
  const p = path.join(assetsDir, "manifest.json");
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

// ─── Demo presentation data (dimensions + ratings + basic bio) ───────────────
// After the real scanner populates the four demo libraries, we layer on the
// personal data a real user would build up over time — so the demo account
// lands on a fully "lived-in" UI (rating badges, favourites, actor profiles)
// instead of a blank slate. This is offline, deterministic (seeded PRNG so
// re-seeds are stable), and gated on the demo movie library (isDemo): we only
// ever touch cinema `movies` + the `people` reachable from them, plus the demo
// user's own rows. tv_people / user_tv_* and every other domain are untouched.

// Deterministic PRNG (mulberry32) — never Math.random(), so a re-seed produces
// the same "hand-crafted" spread of ratings/bios rather than churning them.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

// A short, obviously-generic sample bio pool. These assert no real facts — they
// exist purely to show the profile layout populated. Varied by index + name.
const DEMO_BIO_TEMPLATES = [
  (name: string) => `${name} is a celebrated performer known for a versatile screen presence and a string of memorable roles. (demo profile)`,
  (name: string) => `A prolific actor, ${name} has drawn wide acclaim for range and on-screen charisma across many genres. (demo profile)`,
  (name: string) => `${name} rose to prominence through a series of standout performances and remains a fan favourite. (demo profile)`,
  (name: string) => `Widely admired, ${name} brings depth and nuance to every character. (demo profile)`,
];

// Plausible-looking birthplaces — sample data, not real biographical claims.
const DEMO_BIRTHPLACES = [
  "Los Angeles, USA",
  "London, UK",
  "Toronto, Canada",
  "Sydney, Australia",
  "Paris, France",
];

const pick = <T>(arr: T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length];

/**
 * Seed the demo user's presentation data: rating dimensions on the account,
 * random high multi-dimension ratings for the demo movies + their cinema
 * actors, and a basic (obviously-generic) bio for those actors.
 *
 * Idempotent: rating rows already present for a movie/person are skipped, and
 * bio columns are only filled when currently null so a re-seed never clobbers.
 * Gated on `movieLibraryId` being the demo (isDemo) movie library.
 */
function seedDemoUserData(userId: string, locale: string, movieLibraryId: string): void {
  const zh = locale.toLowerCase().startsWith("zh");

  // Locale-driven dimension names (demo user's locale, default "en").
  const movieDims = zh ? ["剧情", "画面", "音乐"] : ["Plot", "Visuals", "Music"];
  const personDims = zh ? ["颜值", "演技"] : ["Looks", "Acting"];
  const movieWeights: Record<string, number> = Object.fromEntries(movieDims.map((d) => [d, 1]));
  const personWeights: Record<string, number> = Object.fromEntries(personDims.map((d) => [d, 1]));

  // A "好评" score biased high: nearest 0.5 in [7.0, 9.5].
  const ratingVal = (rnd: () => number): number => {
    const steps = Math.floor(rnd() * 6); // 0..5 → 7.0,7.5,…,9.5
    return 7.0 + steps * 0.5;
  };

  // weightedAvg mirrors src/app/api/settings/personal-metadata/route.ts.
  const weightedAvg = (dimRatings: Record<string, number>, weights: Record<string, number>): number => {
    let weightedSum = 0, weightSum = 0;
    for (const [dim, val] of Object.entries(dimRatings)) {
      if (val != null && val > 0) {
        const w = weights[dim] ?? 1;
        weightedSum += val * w;
        weightSum += w;
      }
    }
    return weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : 0;
  };

  // 1. Dimension definitions on the demo user — upsert the preferences row.
  const existingPrefs = db
    .select({ id: userPreferences.id })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .get();
  if (existingPrefs) {
    db.update(userPreferences)
      .set({
        movieRatingDimensions: JSON.stringify(movieDims),
        personRatingDimensions: JSON.stringify(personDims),
        movieDimensionWeights: JSON.stringify(movieWeights),
        personDimensionWeights: JSON.stringify(personWeights),
        showMovieRatingBadge: true,
        showPersonRatingBadge: true,
      })
      .where(eq(userPreferences.id, existingPrefs.id))
      .run();
  } else {
    db.insert(userPreferences)
      .values({
        id: uuid(),
        userId,
        movieRatingDimensions: JSON.stringify(movieDims),
        personRatingDimensions: JSON.stringify(personDims),
        movieDimensionWeights: JSON.stringify(movieWeights),
        personDimensionWeights: JSON.stringify(personWeights),
        showMovieRatingBadge: true,
        showPersonRatingBadge: true,
      })
      .run();
  }

  // 2. Movie ratings — one row per demo movie, deterministically varied by index.
  const demoMovies = db
    .select({ id: movies.id })
    .from(movies)
    .where(eq(movies.mediaLibraryId, movieLibraryId))
    .all();
  demoMovies.forEach((movie, i) => {
    const exists = db
      .select({ id: userMovieData.id })
      .from(userMovieData)
      .where(and(eq(userMovieData.userId, userId), eq(userMovieData.movieId, movie.id)))
      .get();
    if (exists) return; // idempotent
    const rnd = mulberry32(0x5eed_11a5 + i * 2654435761);
    const dimensionRatings: Record<string, number> = Object.fromEntries(movieDims.map((d) => [d, ratingVal(rnd)]));
    db.insert(userMovieData)
      .values({
        id: uuid(),
        userId,
        movieId: movie.id,
        playbackPositionSeconds: 0,
        currentDisc: 1,
        playCount: 0,
        isPlayed: false,
        isFavorite: i % 5 === 0, // sprinkle a few favourites for the UI
        personalRating: weightedAvg(dimensionRatings, movieWeights),
        dimensionRatings: JSON.stringify(dimensionRatings),
        vrLayout: null,
        lastPlayedAt: null,
      })
      .run();
  });

  // 3. Cinema actor bio + ratings — only `people` reachable from demo movies
  // (DISTINCT personId over movie_people joined to the demo movie library).
  const demoPeople = db
    .selectDistinct({ personId: moviePeople.personId })
    .from(moviePeople)
    .innerJoin(movies, eq(moviePeople.movieId, movies.id))
    .where(eq(movies.mediaLibraryId, movieLibraryId))
    .all();
  demoPeople.forEach((row, i) => {
    const personId = row.personId;
    const person = db
      .select({ id: people.id, name: people.name, overview: people.overview, birthDate: people.birthDate, placeOfBirth: people.placeOfBirth })
      .from(people)
      .where(eq(people.id, personId))
      .get();
    if (!person) return;

    // Basic bio — only fill columns that are currently null (re-seed safe).
    const rnd = mulberry32(0xb10_bee5 + i * 40503);
    const bioSet: Partial<{ overview: string; birthDate: string; birthYear: number; placeOfBirth: string }> = {};
    if (person.overview == null) bioSet.overview = pick(DEMO_BIO_TEMPLATES, i)(person.name);
    if (person.birthDate == null) {
      // Construct a plausible date string straight from the PRNG — no `new Date()`.
      const year = 1955 + Math.floor(rnd() * 41); // 1955..1995
      const month = 1 + Math.floor(rnd() * 12);
      const day = 1 + Math.floor(rnd() * 28); // 1..28 → always valid
      bioSet.birthDate = `${year}-${pad2(month)}-${pad2(day)}`;
      bioSet.birthYear = year;
    }
    if (person.placeOfBirth == null) bioSet.placeOfBirth = pick(DEMO_BIRTHPLACES, i);
    if (Object.keys(bioSet).length > 0) {
      db.update(people).set(bioSet).where(eq(people.id, personId)).run();
    }

    // Rating — insert one row per actor unless it already exists (idempotent).
    const exists = db
      .select({ id: userPersonData.id })
      .from(userPersonData)
      .where(and(eq(userPersonData.userId, userId), eq(userPersonData.personId, personId)))
      .get();
    if (exists) return;
    const rrnd = mulberry32(0xac_704 + i * 2246822519);
    const dimensionRatings: Record<string, number> = Object.fromEntries(personDims.map((d) => [d, ratingVal(rrnd)]));
    db.insert(userPersonData)
      .values({
        id: uuid(),
        userId,
        personId,
        personalRating: weightedAvg(dimensionRatings, personWeights),
        dimensionRatings: JSON.stringify(dimensionRatings),
        isFavorite: i % 4 === 0,
      })
      .run();
  });
}

export async function seedDemo(
  onProgress: (p: DemoProgress) => void = () => {},
  userId?: string,
  locale: string = "en",
): Promise<void> {
  // Resolve the asset pack — local committed tree (dev), prior download cache,
  // or a fresh download from the GitHub release. Bytes are surfaced as the
  // "download" phase so the wizard can show a real transfer progress bar.
  onProgress({ phase: "download", current: 0, total: 0, title: "Downloading demo assets" });
  const assets = await ensureDemoAssets(({ receivedBytes, totalBytes }) =>
    onProgress({ phase: "download", current: receivedBytes, total: totalBytes, title: "Downloading demo assets" }),
  );

  const demoRoot = getDemoDir();
  const manifest = readManifest(assets);
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
  // The VR movie gets the real VR clip in its slot instead of the placeholder,
  // so it plays as an actual 360°/VR sample; everything else stays a placeholder.
  const vrSrc = manifest.vr ? path.join(assets, manifest.vr) : null;
  const vrAvailable = !!(vrSrc && manifest.vrMovie && fs.existsSync(vrSrc));
  if (fs.existsSync(cinemaDir)) {
    for (const movie of fs.readdirSync(cinemaDir)) {
      const dir = path.join(cinemaDir, movie);
      if (!fs.statSync(dir).isDirectory()) continue;
      const isVr = vrAvailable && movie === manifest.vrMovie;
      placeVideo(isVr ? vrSrc! : placeholder, path.join(dir, `${movie}.mp4`));
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
  // The cinema homepage orders by dateAdded DESC, but every just-scanned demo
  // movie shares the same datetime('now') — a non-deterministic tie. Nudge the
  // VR movie a few seconds later so it deterministically wins (hero + first in
  // Recently Added), showcasing the VR clip up front.
  if (vrAvailable) {
    db.update(movies)
      .set({ dateAdded: sql`datetime('now','+5 seconds')` })
      .where(eq(movies.folderPath, path.join(cinemaDir, manifest.vrMovie!)))
      .run();
  }
  await seedDomain("tvshow", manifest.libraries.tv, tvDir, onProgress, "tv");
  await seedDomain("photo", manifest.libraries.photos, photosDir, onProgress, "photos");
  await seedDomain("music", manifest.libraries.music, musicDir, onProgress, "music");

  // 4. Layer the demo user's presentation data (rating dimensions + high
  // multi-dim ratings for movies & cinema actors + basic actor bio) over the
  // scanned cinema library. Gated on the demo (isDemo) movie library id.
  if (userId) {
    const demoMovieLib = db
      .select({ id: mediaLibraries.id })
      .from(mediaLibraries)
      .where(and(eq(mediaLibraries.type, "movie"), eq(mediaLibraries.isDemo, true)))
      .get();
    if (demoMovieLib) seedDemoUserData(userId, locale, demoMovieLib.id);
  }

  onProgress({ phase: "done", current: 1, total: 1, title: "Demo ready" });
}

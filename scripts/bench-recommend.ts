/**
 * 今晚看什么 recommendation benchmark at large-library scale.
 *
 * Snapshots data/kubby.db (read-only online backup — the real DB is never
 * written) into a temp data dir, inflates it to ~5,000 movies / ~15,000 people
 * / ~40,000 cast rows with user data, ~600 video bookmarks (fake thumbnail
 * paths — the engine never stats them) + history for the first admin user, then
 * times the engine entry points (pool / draw) and the /api/filters handler
 * directly — no dev server needed. The temp dir is deleted afterwards.
 *
 * Usage:
 *   npx tsx scripts/bench-recommend.ts [--movies 5000] [--runs 20] [--keep]
 *
 * Needs at least one movie library with ≥ 1 movie and one user in the source DB.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { performance } from "perf_hooks";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

const args = process.argv.slice(2);
const argNum = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
};
const TARGET_MOVIES = argNum("movies", 5000);
const RUNS = argNum("runs", 20);
const KEEP = args.includes("--keep");
const CAST_PER_MOVIE = 8;
const TARGET_PEOPLE = Math.round(TARGET_MOVIES * 3);
const TARGET_BOOKMARKS = 600;

// Deterministic PRNG (mulberry32) so runs are comparable across code changes.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const sample = <T>(arr: T[], n: number) => {
  const out = new Set<T>();
  while (out.size < Math.min(n, arr.length)) out.add(pick(arr));
  return [...out];
};
/** Zipf-ish index in [0, n): small indices are much more likely. */
const zipf = (n: number, s = 1.1) => Math.min(n - 1, Math.floor(Math.pow(rand(), s * 3) * n));
const sqlDate = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const DAY = 86_400_000;

// ─── 1. snapshot + inflate ──────────────────────────────────────

const srcPath = path.join(process.cwd(), "data", "kubby.db");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kubby-bench-"));
const dbPath = path.join(tmpDir, "kubby.db");

async function snapshot() {
  // Read-only connection + online backup: consistent even with the dev
  // server holding the WAL, and the source is never opened for writing.
  const src = new Database(srcPath, { readonly: true, fileMustExist: true });
  await src.backup(dbPath);
  src.close();
}

function inflate() {
  const d = new Database(dbPath);
  d.pragma("journal_mode = WAL");
  d.pragma("foreign_keys = OFF");

  const user = d.prepare("SELECT id FROM users ORDER BY is_admin DESC, created_at LIMIT 1").get() as { id: string } | undefined;
  if (!user) throw new Error("source DB has no users");
  const lib = d.prepare("SELECT id FROM media_libraries WHERE type = 'movie' LIMIT 1").get() as { id: string } | undefined;
  if (!lib) throw new Error("source DB has no movie library");

  const baseMovies = d.prepare("SELECT * FROM movies WHERE media_library_id = ? AND poster_path IS NOT NULL").all(lib.id) as Record<string, unknown>[];
  if (!baseMovies.length) throw new Error("movie library has no movies with posters");
  const basePeople = d.prepare("SELECT * FROM people WHERE type = 'actor'").all() as Record<string, unknown>[];
  if (!basePeople.length) throw new Error("source DB has no actors");

  // Genre / tag vocabularies from the real library, padded so filters have variety.
  const genreSet = new Set<string>(["Drama", "Comedy", "Action", "Thriller", "Romance", "Horror", "Animation", "Documentary", "Crime", "Family", "Fantasy", "History", "Music", "Mystery", "Science Fiction", "War", "Western", "Adventure"]);
  const tagSet = new Set<string>();
  for (const m of baseMovies) {
    for (const g of JSON.parse((m.genres as string) || "[]")) genreSet.add(g);
    for (const t of JSON.parse((m.tags as string) || "[]")) tagSet.add(t);
  }
  // Real TMDB keyword vocabularies are large (~1–3 distinct per movie).
  for (let i = tagSet.size; i < TARGET_MOVIES * 2; i++) tagSet.add(`keyword ${i}`);
  const genres = [...genreSet];
  const tags = [...tagSet];

  const now = Date.now();
  const movieCols = Object.keys(baseMovies[0]);
  const insMovie = d.prepare(`INSERT INTO movies (${movieCols.join(",")}) VALUES (${movieCols.map(() => "?").join(",")})`);
  const personCols = Object.keys(basePeople[0]);
  const insPerson = d.prepare(`INSERT INTO people (${personCols.join(",")}) VALUES (${personCols.map(() => "?").join(",")})`);
  const insMp = d.prepare("INSERT INTO movie_people (id, movie_id, person_id, role, sort_order) VALUES (?, ?, ?, ?, ?)");
  const insUmd = d.prepare(`INSERT OR REPLACE INTO user_movie_data (id, user_id, movie_id, play_count, is_played, is_favorite, personal_rating, dimension_ratings, last_played_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insUpd = d.prepare("INSERT OR REPLACE INTO user_person_data (id, user_id, person_id, personal_rating, is_favorite) VALUES (?, ?, ?, ?, ?)");
  const insHist = d.prepare("INSERT INTO recommendation_history (id, user_id, item_type, item_id, action, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const insMb = d.prepare(`INSERT INTO movie_bookmarks (id, user_id, movie_id, timestamp_seconds, disc_number, icon_type, tags, note, thumbnail_path, thumbnail_aspect, view_state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const run = d.transaction(() => {
    // People: clone actors up to TARGET_PEOPLE (85% with a photo) + a director pool.
    const actorIds = basePeople.map((p) => p.id as string);
    while (actorIds.length < TARGET_PEOPLE) {
      const b = pick(basePeople);
      const id = uuidv4();
      const row = { ...b, id, name: `${b.name} ${actorIds.length}`, photo_path: rand() < 0.85 ? (b.photo_path ?? "metadata/people/x/photo.jpg") : null, tmdb_id: null, imdb_id: null };
      insPerson.run(...personCols.map((c) => row[c as keyof typeof row] ?? null));
      actorIds.push(id);
    }
    const directorIds: string[] = [];
    for (let i = 0; i < 800; i++) {
      const b = pick(basePeople);
      const id = uuidv4();
      const row = { ...b, id, name: `Director ${i}`, type: "director", photo_path: null, tmdb_id: null, imdb_id: null };
      insPerson.run(...personCols.map((c) => row[c as keyof typeof row] ?? null));
      directorIds.push(id);
    }
    const stars = actorIds.slice(0, Math.min(actorIds.length, 300));

    // Movies: clone up to TARGET_MOVIES with varied metadata + ~8 billed cast.
    const movieIds = baseMovies.map((m) => m.id as string);
    for (let i = baseMovies.length; i < TARGET_MOVIES; i++) {
      const b = baseMovies[i % baseMovies.length];
      const id = uuidv4();
      const nGenres = 1 + Math.floor(rand() * 3);
      const row: Record<string, unknown> = {
        ...b,
        id,
        title: `${b.title} #${i}`,
        sort_name: `${b.title} #${i}`,
        file_path: `${b.file_path}.${i}`,
        tmdb_id: null,
        imdb_id: null,
        genres: JSON.stringify(sample(genres.slice(0, 8), 1).concat(sample(genres, nGenres - 1)).filter((g, k, a) => a.indexOf(g) === k)),
        tags: JSON.stringify(sample(tags, Math.floor(rand() * 25))),
        year: 1950 + Math.floor(rand() * 76),
        runtime_minutes: rand() < 0.05 ? null : 70 + Math.floor(rand() * 110),
        community_rating: rand() < 0.05 ? null : Math.round((4 + rand() * 5) * 1000) / 1000,
        date_added: sqlDate(now - Math.floor(rand() * 3 * 365) * DAY),
        poster_mtime: Date.now() / 1000,
      };
      insMovie.run(...movieCols.map((c) => row[c] ?? null));
      movieIds.push(id);
      const cast = new Set<string>();
      while (cast.size < 2) cast.add(stars[zipf(stars.length)]);
      while (cast.size < CAST_PER_MOVIE) cast.add(rand() < 0.3 ? stars[zipf(stars.length)] : actorIds[zipf(actorIds.length, 0.5)]);
      const noOrder = rand() < 0.05;
      [...cast].forEach((pid, k) => insMp.run(uuidv4(), id, pid, `Role ${k}`, noOrder ? null : k));
      insMp.run(uuidv4(), id, pick(directorIds), "Director", null);
    }

    // User movie data: ~30% touched — played / rated / dimension-only / favorited.
    for (const mid of sample(movieIds, Math.round(movieIds.length * 0.3))) {
      const played = rand() < 0.55;
      const rated = rand() < 0.25;
      const dimsOnly = !rated && rand() < 0.1;
      const r = () => Math.round((5 + rand() * 5) * 10) / 10;
      insUmd.run(
        uuidv4(), user.id, mid,
        played ? 1 + Math.floor(rand() * 3) : 0,
        played ? 1 : 0,
        rand() < 0.08 ? 1 : 0,
        rated ? r() : null,
        dimsOnly ? JSON.stringify({ Plot: r(), Visuals: r(), Music: r() }) : null,
        played || rand() < 0.2 ? new Date(now - Math.floor(rand() * 720) * DAY).toISOString() : null
      );
    }
    // Person data: a few hundred rated + some favorites (biased to stars).
    for (let i = 0; i < 300; i++) {
      const pid = i < 200 ? stars[zipf(stars.length)] : pick(actorIds);
      insUpd.run(uuidv4(), user.id, pid, rand() < 0.85 ? Math.round((5 + rand() * 5) * 10) / 10 : null, rand() < 0.25 ? 1 : 0);
    }
    // Video bookmarks: Zipf over the movies (so some films carry several),
    // ~10% without a thumbnail (ineligible), ages up to 2 years.
    const bookmarkIds: string[] = [];
    const icons = ["bookmark", "action", "music", "dialogue", "funny"];
    for (let i = 0; i < TARGET_BOOKMARKS; i++) {
      const id = uuidv4();
      const mid = movieIds[zipf(movieIds.length, 0.6)];
      const thumb = rand() < 0.9 ? path.join(tmpDir, "metadata", "bookmarks", user.id, mid, `${id}.jpg`) : null;
      const aspect = pick([1.7778, 1.7778, 2.39, 0.5625, 2, null]);
      insMb.run(
        id, user.id, mid, Math.floor(rand() * 7200), rand() < 0.1 ? 2 : 1, pick(icons),
        rand() < 0.6 ? JSON.stringify(sample(tags.slice(0, 40), 1 + Math.floor(rand() * 3))) : null,
        rand() < 0.4 ? `note ${i}` : null, thumb, aspect,
        aspect === 2 ? JSON.stringify({ lon: 10, lat: 0, fov: 75 }) : null,
        rand() < 0.5 ? sqlDate(now - Math.floor(rand() * 730) * DAY) : new Date(now - Math.floor(rand() * 730) * DAY).toISOString()
      );
      if (thumb) bookmarkIds.push(id);
    }
    // History: a few thousand rows spread over the 120-day retention window.
    for (let i = 0; i < 300; i++) {
      insHist.run(uuidv4(), user.id, "bookmark", pick(bookmarkIds), rand() < 0.1 ? "dismissed" : "shown", sqlDate(now - Math.floor(rand() * 120 * DAY)));
    }
    for (let i = 0; i < 3000; i++) {
      const person = rand() < 0.2;
      insHist.run(
        uuidv4(), user.id, person ? "person" : "movie",
        person ? stars[zipf(stars.length)] : pick(movieIds),
        rand() < 0.1 ? "dismissed" : "shown",
        sqlDate(now - Math.floor(rand() * 120 * DAY))
      );
    }
  });
  run();

  const counts = Object.fromEntries(
    ["movies", "people", "movie_people", "user_movie_data", "user_person_data", "movie_bookmarks", "recommendation_history"].map((t) => [
      t,
      (d.prepare(`SELECT count(*) c FROM ${t}`).get() as { c: number }).c,
    ])
  );
  d.pragma("wal_checkpoint(TRUNCATE)");
  d.close();
  return { userId: user.id, libraryId: lib.id, counts, genres };
}

// ─── 2. timing ──────────────────────────────────────────────────

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return { median: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}

/** `fn` may return its own measured ms (to exclude setup work) — else the whole call is timed. */
async function time(label: string, fn: () => unknown | Promise<unknown>, before?: () => void) {
  for (let i = 0; i < 2; i++) {
    before?.();
    await fn(); // warm-up (JIT + first DB open)
  }
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    before?.();
    const t0 = performance.now();
    const own = await fn();
    samples.push(typeof own === "number" ? own : performance.now() - t0);
  }
  const { median, p95, max } = stats(samples);
  console.log(`${label.padEnd(44)} median ${median.toFixed(1).padStart(7)} ms   p95 ${p95.toFixed(1).padStart(7)} ms   max ${max.toFixed(1).padStart(7)} ms`);
}

let appLoaded = false;

async function main() {
  console.log(`Snapshotting ${srcPath} → ${tmpDir}`);
  await snapshot();
  const t0 = performance.now();
  const { userId, counts, genres } = inflate();
  console.log(`Inflated in ${((performance.now() - t0) / 1000).toFixed(1)}s:`, counts);

  // Point the app at the temp copy BEFORE the DB module is first imported.
  process.env.KUBBY_DATA_DIR = tmpDir;
  appLoaded = true;
  const engine = await import("@/lib/recommend/engine");
  const { getFilterOptionsBody } = await import("@/lib/filter-options");
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");

  const f = (raw: Record<string, unknown>) => engine.sanitizeFilters(raw);
  const pool = engine.getPool(userId, f({}));
  console.log(`Pool (no filters): movieCount=${pool.movieCount} actorCount=${pool.actorCount} clipCount=${pool.clipCount} items=${pool.items.length}`);
  checkSeededPool();
  checkClips();
  console.log("");

  /**
   * Seeded pile stability: same seed, genre filter widened g0 → g0∪g1 and back.
   * Every card of the wide pile that still matches g0 must stay when narrowing
   * (top-N of a subset ⊇ top-N of the superset ∩ subset) — only real
   * leavers/newcomers change. Unseeded piles are printed for contrast.
   */
  function checkSeededPool() {
    const seed = "bench-seed";
    const [g0, g1] = [genres[0], genres[1 % genres.length]];
    const narrow = f({ genres: [g0], mix: "movies" });
    const wide = f({ genres: [g0, g1], mix: "movies" });
    const key = (p: { type: string; id: string }) => `${p.type}:${p.id}`;
    const g0Ids = new Set(
      (db.all(sql`SELECT id FROM movies WHERE genres LIKE ${`%"${g0}"%`}`) as { id: string }[]).map((r) => r.id)
    );
    const kept = (from: { items: { type: string; id: string }[] }, to: { items: { type: string; id: string }[] }) => {
      const toKeys = new Set(to.items.map(key));
      const overlap = from.items.filter((p) => g0Ids.has(p.id)); // cards that match both filters
      return { kept: overlap.filter((p) => toKeys.has(key(p))).length, overlap: overlap.length };
    };

    const a = engine.getPool(userId, narrow, { seed });
    const a2 = engine.getPool(userId, narrow, { seed });
    if (a.items.map(key).join() !== a2.items.map(key).join()) throw new Error("seeded pool is not deterministic");
    const b = engine.getPool(userId, wide, { seed });
    const seeded = kept(b, a);
    const unseeded = kept(engine.getPool(userId, wide), engine.getPool(userId, narrow));
    console.log(
      `Seeded pile (${g0}∪${g1} → ${g0}, ${a.items.length}/${b.items.length} items): kept ${seeded.kept}/${seeded.overlap}` +
        ` still-matching cards (unseeded: ${unseeded.kept}/${unseeded.overlap})`
    );
    if (seeded.overlap > 0 && seeded.kept < seeded.overlap * 0.9) {
      throw new Error(`seeded pool churned: kept only ${seeded.kept}/${seeded.overlap} overlapping items`);
    }
  }

  /**
   * Clip invariants: clip piles are clips only (seeded = deterministic), clip
   * hands hold ≤ 1 clip per film with bookmarkMoment first, and a mixed hand's
   * wildcard never shares a film with a movie card. Draws here don't record.
   */
  function checkClips() {
    const clipPool = engine.getPool(userId, f({ mix: "clips" }), { seed: "bench-seed" });
    if (clipPool.items.some((p) => p.type !== "bookmark" || !p.still)) throw new Error("clip pile holds a non-clip / still-less item");
    if (clipPool.items.length !== Math.min(64, clipPool.clipCount)) throw new Error("clip pile not filled to the cap");
    const again = engine.getPool(userId, f({ mix: "clips" }), { seed: "bench-seed" });
    if (again.items.map((p) => p.id).join() !== clipPool.items.map((p) => p.id).join()) throw new Error("seeded clip pile is not deterministic");
    const mixedClips = engine.getPool(userId, f({})).items.filter((p) => p.type === "bookmark").length;
    if (mixedClips < 1 || mixedClips > 6) throw new Error(`mixed pile has ${mixedClips} clips (want 1–6)`);
    if (engine.getPool(userId, f({ mix: "movies" })).clipCount !== 0) throw new Error("movies pile reports clips");

    let wildcards = 0;
    const N = 200;
    for (let i = 0; i < 20; i++) {
      const hand = engine.drawHand(userId, { filters: f({ mix: "clips" }), movies: 0, actors: 0, clips: 5, exclude: [] }, { record: false });
      const clipCards = hand.cards.filter((c) => c.type === "bookmark");
      if (clipCards.length !== 5 || hand.cards.length !== 5) throw new Error(`clip hand has ${hand.cards.length} cards`);
      if (new Set(clipCards.map((c) => c.movieId)).size !== 5) throw new Error("clip hand repeats a film");
      if (clipCards.some((c) => c.reasons[0]?.code !== "bookmarkMoment" || c.reasons.length > 3)) throw new Error("clip reasons malformed");
    }
    for (let i = 0; i < N; i++) {
      const hand = engine.drawHand(userId, { filters: f({}), movies: 4, actors: 1, clipWildcard: true, exclude: [] }, { record: false });
      if (hand.cards.length !== 5) throw new Error(`wildcard hand has ${hand.cards.length} cards`);
      const clipCards = hand.cards.filter((c) => c.type === "bookmark");
      if (clipCards.length > 1) throw new Error("more than one wildcard clip");
      if (clipCards.length) {
        wildcards++;
        const movieIds = new Set(hand.cards.filter((c) => c.type === "movie").map((c) => c.id));
        if (movieIds.has(clipCards[0].movieId)) throw new Error("wildcard clip shares a film with a movie card");
      }
    }
    console.log(`Clips: pile ${clipPool.items.length}/${clipPool.clipCount}, mixed pile clips ${mixedClips}, wildcard in ${wildcards}/${N} mixed hands`);
    if (wildcards < N * 0.15 || wildcards > N * 0.45) throw new Error(`wildcard rate ${wildcards}/${N} is far from 0.3`);
  }

  // Simulates "the user just rated something" — the first request after a write.
  let bump = 0;
  const touchUserData = () => {
    bump++;
    db.run(sql`UPDATE user_movie_data SET personal_rating = ${5 + (bump % 50) / 10}
      WHERE id = (SELECT id FROM user_movie_data WHERE user_id = ${userId} LIMIT 1)`);
  };

  // Simulates a scan / metadata edit — invalidates the engine's library snapshot.
  const touchLibrary = () => {
    bump++;
    db.run(sql`UPDATE movies SET community_rating = ${5 + (bump % 50) / 10} WHERE rowid = (SELECT max(rowid) FROM movies)`);
  };

  console.log(`runs=${RUNS} (after 2 warm-ups)`);
  await time("pool  (no filters, mixed)", () => engine.getPool(userId, f({})));
  await time("pool  (no filters, mixed) after user write", () => engine.getPool(userId, f({})), touchUserData);
  await time("pool  (no filters, mixed) after library write", () => engine.getPool(userId, f({})), touchLibrary);
  await time("pool  (watched=any, mixed)", () => engine.getPool(userId, f({ watched: "any" })));
  await time(`pool  (genre ${genres[0]})`, () => engine.getPool(userId, f({ genres: [genres[0]] })));
  await time("pool  (movies only)", () => engine.getPool(userId, f({ mix: "movies" })));
  await time("pool  (no filters, mixed, seeded)", () => engine.getPool(userId, f({}), { seed: "bench-seed" }));
  await time("pool  (clips)", () => engine.getPool(userId, f({ mix: "clips", watched: "any" })));
  await time("draw  (mixed 4+1)", () => engine.drawHand(userId, { filters: f({}), movies: 4, actors: 1, exclude: [] }));
  await time("draw  (mixed 4+1) after user write", () => engine.drawHand(userId, { filters: f({}), movies: 4, actors: 1, exclude: [] }), touchUserData);
  await time("draw  (movies 5)", () => engine.drawHand(userId, { filters: f({ mix: "movies" }), movies: 5, actors: 0, exclude: [] }));
  await time("draw  (clips 5)", () => engine.drawHand(userId, { filters: f({ mix: "clips", watched: "any" }), movies: 0, actors: 0, clips: 5, exclude: [] }));
  await time("draw  (mixed 4+1, clip wildcard)", () => engine.drawHand(userId, { filters: f({}), movies: 4, actors: 1, clipWildcard: true, exclude: [] }));
  await time("draw  (actors 5)", () => engine.drawHand(userId, { filters: f({ mix: "actors" }), movies: 0, actors: 5, exclude: [] }));
  await time("draw  (1-card refill, 4 locked)", () => {
    const hand = engine.drawHand(userId, { filters: f({}), movies: 4, actors: 0, exclude: [] }, { record: false });
    const t1 = performance.now();
    engine.drawHand(userId, { filters: f({}), movies: 1, actors: 0, exclude: hand.cards.map((c) => ({ type: c.type, id: c.id })) });
    return performance.now() - t1;
  });
  const filtersCall = () => getFilterOptionsBody(null);
  await time("/api/filters (all libraries)", filtersCall);
  await time("/api/filters after library write", filtersCall, touchLibrary);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Close the app's connection so Windows lets us delete the file. Only once
    // KUBBY_DATA_DIR points at the temp dir — touching `db` otherwise would
    // open (and migrate) the real data/kubby.db.
    if (appLoaded) {
      try {
        const { db } = await import("@/lib/db");
        (db as unknown as { $client?: { close(): void } }).$client?.close();
      } catch {
        /* not opened */
      }
    }
    if (KEEP) console.log(`\nKept temp data dir: ${tmpDir}`);
    else fs.rmSync(tmpDir, { recursive: true, force: true });
  });

// 今晚看什么 recommendation engine (server-only: imports the DB).
//
// Pipeline per request:
//   1. Hard filters → one SQL pass over `movies` (movie-type libraries only —
//      allowlist, never a blocklist); the watched filter + user fields come
//      from the caller's user_movie_data rows (LEFT JOIN semantics).
//   2. Personal signals (genre / tag affinity, liked cast) → per-movie score in
//      JS. Every scoring term carries the reason it would explain, so the card
//      "why" chips are simply the strongest contributing terms.
//   3. Weighted random sampling WITHOUT replacement (Efraimidis–Spirakis), then
//      a greedy diversity pass (≤ 2 per primary genre, no shared lead actor),
//      relaxed step by step if the hand can't be filled.
//   4. Cross-session de-dup from `recommendation_history`: shown < 30 days or
//      dismissed < 90 days are held back; if the fresh pool can't fill the
//      hand they are re-admitted oldest-first (dismissed last) and the
//      response says `repeatsAllowed`.
//   5. Clips (video bookmarks): the caller's own thumbnailed movie_bookmarks,
//      filtered through the parent movie, weighted toward older marks; never
//      two of one film, never a clip of a film dealt as a movie card.
//
// Library-only data (metadata, parsed genres/tags, the cast of every movie) is
// an in-memory snapshot invalidated by a trigger-maintained version counter;
// per request it's two light indexed reads of the caller's data + one id-only
// filter pass + in-memory scoring (no N+1). `scripts/bench-recommend.ts`
// times it on a 5k-movie copy of the DB: pool ≈ 10 ms, draw ≈ 35 ms warm
// (≈ +90 ms once after a library write, to rebuild the snapshot).

import path from "path";
import { and, eq, lt, sql, type SQL } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { readDataVersion } from "@/lib/db/data-versions";
import { recommendationHistory } from "@/lib/db/schema";
import { resolveDataPath } from "@/lib/paths";
import type {
  ActorCardData,
  ClipCardData,
  DrawRequest,
  DrawResponse,
  HistoryRequest,
  MovieCardData,
  PoolItem,
  PoolResponse,
  RecommendCard,
  RecommendFilters,
  RecommendItemRef,
  RecommendReason,
} from "./types";

export { parseFiltersFromSearchParams, parseDrawRequest, parseHistoryRequest, parsePoolSeed, sanitizeFilters } from "./parse";

type Rng = () => number;

const DAY_MS = 86_400_000;
/** A 'shown' card is held back this long. */
export const SHOWN_COOLDOWN_DAYS = 30;
/** A 'dismissed' card is held back this long (and re-admitted last). */
export const DISMISS_COOLDOWN_DAYS = 90;
/** History rows older than this are pruned on draw. */
export const HISTORY_RETENTION_DAYS = 120;
/** = the scenes' real-card caps (vortex CLOUD_CAP, tabletop PILE_CAP): anything
 *  more is never shown, and vortex ghost copies reuse only shown images. */
const POOL_CAP = 64;
const RECENT_PLAY_DAYS = 60;
const NEW_DAYS = 30;
const GEM_AGE_DAYS = 90;
/** Absolute "highly rated" bar on the 0–10 personal scale (see highThreshold). */
const HIGH_RATING = 8;
/** communityRating at/above which a card gets the `highRating` chip. */
const HIGH_COMMUNITY = 7.5;
const MAX_PER_PRIMARY_GENRE = 2;
const LEAD_CAST = 2;
/** Billing positions that count as main cast for actor-card eligibility. */
const MAIN_CAST = 6;
/** Films attached to an actor card (only used for its fanart backdrop now). */
const ACTOR_FILMS = 2;
/** Mixed piles show up to this many clips (from the movie share) — the wildcard's visual source. */
const POOL_MIXED_CLIPS = 6;
/** Mixed hands: chance a draw deals one clip in place of a movie… */
const CLIP_WILDCARD_P = 0.3;
/** …and the fresh (not held back) clips needed to even try. */
const CLIP_WILDCARD_MIN = 3;
/** Rediscovery boost grows linearly to its max (+1) at this bookmark age. */
const CLIP_AGE_FULL_DAYS = 180;
const DEFAULT_STILL_ASPECT = 16 / 9;

// ─── helpers ────────────────────────────────────────────────────

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

function parseStringArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** personal_rating, falling back to the plain mean of positive dimension ratings. */
function effectiveRating(personal: number | null, dimsJson: string | null): number | null {
  if (personal != null && Number.isFinite(personal)) return personal;
  if (!dimsJson) return null;
  try {
    const dims = JSON.parse(dimsJson) as Record<string, unknown>;
    const vals = Object.values(dims).filter((v): v is number => typeof v === "number" && v > 0);
    return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  } catch {
    return null;
  }
}

/** Parses SQLite `datetime('now')` (UTC, no zone) as well as ISO strings. */
function parseDbDate(s: string | null): number | null {
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(" ", "T")}Z` : s;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Any-of match against a JSON-array text column (same `%"value"%` approach as /api/movies). */
function jsonArrayAnyOf(column: SQL, values: string[]): SQL {
  const parts = values.map((v) => sql`${column} LIKE ${`%"${escapeLike(v)}"%`} ESCAPE '\\'`);
  return sql`(${sql.join(parts, sql` OR `)})`;
}

/**
 * "Highly rated" bar for a user. Absolute 8/10 by default; users who rate on a
 * compressed scale (everything 4–5) would otherwise never trigger it, so with
 * ≥ 5 ratings the bar drops to their own 75th percentile (never above 8).
 */
function highThreshold(ratings: number[]): number {
  if (ratings.length < 5) return HIGH_RATING;
  const sorted = [...ratings].sort((a, b) => a - b);
  return Math.min(HIGH_RATING, sorted[Math.floor(0.75 * (sorted.length - 1))]);
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Stable 32-bit rank of `key` under `seed` (FNV-1a + murmur3 finalizer). */
function seedRank(seed: string, key: string): number {
  const s = `${seed}|${key}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Efraimidis–Spirakis key in log space: log(u)/w, larger = drawn earlier. */
const esKey = (w: number, rng: Rng) => Math.log(1 - rng()) / Math.max(w, 1e-6);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── library snapshot (cached) ──────────────────────────────────
//
// Everything that depends only on the library — per-movie metadata with
// genres/tags parsed and image paths stamped, the billing-ordered actor cast
// of every movie, and the genre distribution — is built once and kept in
// memory, keyed by the `data_versions` 'cinema_library' counter that SQLite
// triggers bump on any write to movies / movie_people / people /
// media_libraries (db/index.ts). A scan, scrape or edit is therefore picked up
// on the very next request. Per-user data (ratings, plays, favorites,
// history) is NEVER cached — it is re-read on every call, so a new rating
// counts immediately. At 5k movies / 40k cast rows this replaces ~250 ms of
// SQL + JSON + path work per request with map lookups.

interface MovieStatic {
  id: string;
  title: string;
  year: number | null;
  communityRating: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  tags: string[];
  lowerTags: string[];
  primaryGenre: string | null; // lowercase
  hasFanart: boolean;
  /** raw image columns; use posterOf / fanartOf for the stamped paths */
  img: LazyImages;
  dateAddedMs: number | null;
}

/**
 * Image paths are joined + stamped on first use only: win32 path.join costs
 * ~1.5 µs, and only the ≤ 120 returned items ever need one. The object is
 * shared by reference with every per-request Candidate, so the memo sticks.
 */
interface LazyImages {
  folder: string;
  poster: string | null;
  posterMtime: number | null;
  fanart: string | null;
  fanartMtime: number | null;
  posterPath?: string | null;
  fanartPath?: string | null;
}

interface ActorInfo {
  name: string;
  photo: string | null; // raw DB value; use photoOf for the resolved + stamped path
  photoMtime: number | null;
  photoPath?: string | null;
}

const posterOf = (m: MovieStatic) => {
  const i = m.img;
  if (i.posterPath === undefined) i.posterPath = i.poster ? stampPath(path.join(i.folder, i.poster), i.posterMtime) : null;
  return i.posterPath;
};

const fanartOf = (m: MovieStatic) => {
  const i = m.img;
  if (i.fanartPath === undefined) i.fanartPath = stampPath(i.fanart ? path.join(i.folder, i.fanart) : null, i.fanartMtime);
  return i.fanartPath;
};

const photoOf = (a: ActorInfo) => {
  if (a.photoPath === undefined) a.photoPath = stampPath(a.photo ? resolveDataPath(a.photo) : null, a.photoMtime);
  return a.photoPath;
};

interface CastEntry {
  personId: string;
  name: string;
  actor: ActorInfo;
  /** among the first MAIN_CAST billed (NULL sortOrder = not main, unless the movie has no order data at all) */
  main: boolean;
}

interface Library {
  version: number | null;
  /** every movie in a movie-type library (poster or not) */
  movies: Map<string, MovieStatic>;
  /** actor cast per movie, billing order, one entry per person — read-only */
  cast: Map<string, CastEntry[]>;
  /** lowercase genre → number of library movies carrying it */
  libGenre: Map<string, number>;
}

/** Bump when the Library shape changes so a dev hot reload drops the old cache. */
const LIBRARY_CACHE_KEY = "__kubby_recommend_library_v1__";

function buildLibrary(version: number | null): Library {
  const movieRows = db.all<{
    id: string;
    title: string;
    year: number | null;
    community_rating: number | null;
    runtime_minutes: number | null;
    genres: string | null;
    tags: string | null;
    folder_path: string;
    poster_path: string | null;
    poster_mtime: number | null;
    fanart_path: string | null;
    fanart_mtime: number | null;
    date_added: string | null;
  }>(sql`
    SELECT m.id, m.title, m.year, m.community_rating, m.runtime_minutes, m.genres, m.tags,
      m.folder_path, m.poster_path, m.poster_mtime, m.fanart_path, m.fanart_mtime, m.date_added
    FROM movies m
    INNER JOIN media_libraries ml ON ml.id = m.media_library_id AND ml.type = 'movie'
  `);
  const movies = new Map<string, MovieStatic>();
  const libGenre = new Map<string, number>();
  for (const r of movieRows) {
    const genres = parseStringArray(r.genres);
    const tags = parseStringArray(r.tags);
    for (const g of genres) libGenre.set(g.toLowerCase(), (libGenre.get(g.toLowerCase()) ?? 0) + 1);
    movies.set(r.id, {
      id: r.id,
      title: r.title,
      year: r.year,
      communityRating: r.community_rating,
      runtimeMinutes: r.runtime_minutes && r.runtime_minutes > 0 ? r.runtime_minutes : null,
      genres,
      tags,
      lowerTags: tags.map((t) => t.toLowerCase()),
      primaryGenre: genres[0]?.toLowerCase() ?? null,
      hasFanart: !!r.fanart_path,
      img: {
        folder: r.folder_path,
        poster: r.poster_path,
        posterMtime: r.poster_mtime,
        fanart: r.fanart_path,
        fanartMtime: r.fanart_mtime,
      },
      dateAddedMs: parseDbDate(r.date_added),
    });
  }

  // Actors (cinema `people` only).
  const actors = new Map<string, ActorInfo>();
  const actorRows = db.all<{ id: string; name: string; photo_path: string | null; photo_mtime: number | null }>(sql`
    SELECT id, name, photo_path, photo_mtime FROM people WHERE type = 'actor'
  `);
  for (const p of actorRows) actors.set(p.id, { name: p.name, photo: p.photo_path, photoMtime: p.photo_mtime });

  // Cast links grouped per movie, billing-ordered in JS (cheaper than an ORDER
  // BY over every link): COALESCE(sort_order, 999999), then link id.
  type Link = { id: string; personId: string; order: number | null };
  const links = new Map<string, Link[]>();
  // Array rows (`values`): ~40% cheaper than objects at 40k+ rows.
  const linkRows = db.values<[string, string, string, number | null]>(sql`
    SELECT id, movie_id, person_id, sort_order FROM movie_people
  `);
  for (const [id, movieId, personId, order] of linkRows) {
    if (!movies.has(movieId) || !actors.has(personId)) continue;
    let list = links.get(movieId);
    if (!list) links.set(movieId, (list = []));
    list.push({ id, personId, order });
  }
  const cast = new Map<string, CastEntry[]>();
  for (const [movieId, list] of links) {
    list.sort((a, b) => (a.order ?? 999999) - (b.order ?? 999999) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const out: CastEntry[] = [];
    let hasOrder = false;
    for (const l of list) {
      if (l.order != null) hasOrder = true;
      if (out.some((e) => e.personId === l.personId)) continue; // same actor, two roles
      const a = actors.get(l.personId)!;
      // The list is billing-ordered with NULLs last, so the index is the billing rank.
      out.push({ personId: l.personId, name: a.name, actor: a, main: out.length < MAIN_CAST && l.order != null });
    }
    // A movie with no sortOrder data at all: we can't tell who's main → everyone counts.
    if (!hasOrder) for (const e of out) e.main = true;
    cast.set(movieId, out);
  }

  return { version, movies, cast, libGenre };
}

/** The cached snapshot, rebuilt when the library version moved (or on `force`). */
function getLibrary(force = false): Library {
  const g = globalThis as Record<string, unknown>;
  const version = readDataVersion("cinema_library"); // null (unmigrated DB) → never cache
  const cached = g[LIBRARY_CACHE_KEY] as Library | undefined;
  if (!force && cached && version != null && cached.version === version) return cached;
  const lib = buildLibrary(version);
  // Never cache a snapshot read inside an open transaction (it could roll back).
  const client = (db as unknown as { $client?: { inTransaction?: boolean } }).$client;
  if (version != null && !client?.inTransaction) g[LIBRARY_CACHE_KEY] = lib;
  else delete g[LIBRARY_CACHE_KEY];
  return lib;
}

/** Blur placeholders for just the items returned (kept out of the snapshot: ~0.5 KB each). */
function loadBlurs(movieIds: string[], personIds: string[]) {
  const movieBlur = new Map<string, string | null>();
  const personBlur = new Map<string, string | null>();
  for (const ids of chunk(Array.from(new Set(movieIds)), 500)) {
    const rows = db.all<{ id: string; poster_blur: string | null }>(sql`
      SELECT id, poster_blur FROM movies WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `);
    for (const r of rows) movieBlur.set(r.id, r.poster_blur);
  }
  for (const ids of chunk(Array.from(new Set(personIds)), 500)) {
    const rows = db.all<{ id: string; photo_blur: string | null }>(sql`
      SELECT id, photo_blur FROM people WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    `);
    for (const r of rows) personBlur.set(r.id, r.photo_blur);
  }
  return { movieBlur, personBlur };
}

// ─── per-request data ───────────────────────────────────────────

interface Candidate extends MovieStatic {
  isPlayed: boolean;
  isFavorite: boolean;
  playCount: number;
  personalRating: number | null; // effective (dims fallback)
  lastPlayedAt: string | null;
  lastPlayedMs: number | null;
}

interface PersonSignal {
  rating: number | null;
  isFavorite: boolean;
}

interface GenreStat {
  affinity: number; // ≈ [-0.6, 1]
  engaged: number;
  avg: number | null; // raw avg personal rating in the genre
}

interface Signals {
  genres: Map<string, GenreStat>; // keyed lowercase
  tags: Map<string, number>; // lowercase tag → strength 0–1
  people: Map<string, PersonSignal>;
  highMovie: number;
  highPerson: number;
}

interface UserMovieRow {
  movie_id: string;
  is_played: number | null;
  is_favorite: number | null;
  play_count: number | null;
  personal_rating: number | null;
  dimension_ratings: string | null;
  last_played_at: string | null;
}

/** All of the caller's user_movie_data — one indexed read, shared by the filters and the taste profile. */
function loadUserMovieData(userId: string): UserMovieRow[] {
  return db.all<UserMovieRow>(sql`
    SELECT movie_id, is_played, is_favorite, play_count, personal_rating, dimension_ratings, last_played_at
    FROM user_movie_data WHERE user_id = ${userId}
  `);
}

/**
 * Hard filters → one SQL pass over movies returning ids (metadata comes from
 * the snapshot; the watched filter + user fields from the caller's rows —
 * same semantics as LEFT JOIN user_movie_data). Throws nothing; an invalid /
 * non-movie libraryId just yields no candidates. Returns null when a match is
 * missing from `lib` (stale snapshot — the caller rebuilds and retries).
 */
function loadCandidates(f: RecommendFilters, lib: Library, umdRows: UserMovieRow[]): Candidate[] | null {
  const where: SQL[] = [sql`m.poster_path IS NOT NULL`, sql`m.poster_path != ''`];
  if (f.libraryId) where.push(sql`m.media_library_id = ${f.libraryId}`);
  if (f.genres?.length) where.push(jsonArrayAnyOf(sql`m.genres`, f.genres));
  if (f.tags?.length) where.push(jsonArrayAnyOf(sql`m.tags`, f.tags));
  if (f.minRating !== undefined) where.push(sql`m.community_rating >= ${f.minRating}`);
  if (f.yearFrom !== undefined) where.push(sql`m.year >= ${f.yearFrom}`);
  if (f.yearTo !== undefined) where.push(sql`m.year <= ${f.yearTo}`);
  if (f.maxRuntime !== undefined) {
    // Unknown (NULL/0) runtime is kept — better a surprise than a hidden film.
    where.push(sql`(m.runtime_minutes IS NULL OR m.runtime_minutes <= 0 OR m.runtime_minutes <= ${f.maxRuntime})`);
  }
  const watched = f.watched ?? "unwatched";

  const ids = db.values<[string]>(sql`
    SELECT m.id
    FROM movies m
    INNER JOIN media_libraries ml ON ml.id = m.media_library_id AND ml.type = 'movie'
    WHERE ${sql.join(where, sql` AND `)}
  `);

  const umd = new Map(umdRows.map((r) => [r.movie_id, r]));
  const none: Partial<UserMovieRow> = {};
  const out: Candidate[] = [];
  for (const [id] of ids) {
    const s = lib.movies.get(id);
    if (!s) return null;
    const r = umd.get(id) ?? none;
    // = SQL `COALESCE(umd.is_played, 0) = 0` / `umd.is_played = 1`
    if (watched === "unwatched" && (r.is_played ?? 0) !== 0) continue;
    if (watched === "watched" && r.is_played !== 1) continue;
    out.push({
      ...s,
      isPlayed: !!r.is_played,
      isFavorite: !!r.is_favorite,
      playCount: r.play_count ?? 0,
      personalRating: effectiveRating(r.personal_rating ?? null, r.dimension_ratings ?? null),
      lastPlayedAt: r.last_played_at ?? null,
      lastPlayedMs: parseDbDate(r.last_played_at ?? null),
    });
  }
  return out;
}

/** Library-wide taste profile for one user (cinema only). Always read fresh. */
function loadSignals(userId: string, lib: Library, umdRows: UserMovieRow[]): Signals {
  // Movie-type libraries only: rows whose movie isn't in the snapshot are skipped.
  const umd: { r: UserMovieRow; m: MovieStatic; rating: number | null }[] = [];
  for (const r of umdRows) {
    const m = lib.movies.get(r.movie_id);
    if (m) umd.push({ r, m, rating: effectiveRating(r.personal_rating, r.dimension_ratings) });
  }

  const rated = umd.map((x) => x.rating).filter((v): v is number => v != null);
  const userMean = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
  const highMovie = highThreshold(rated);

  // Per-genre: rating sum/count + engagement (played / favorited / rated).
  const acc = new Map<string, { name: string; sum: number; n: number; engaged: number }>();
  const tagCount = new Map<string, number>();
  let totalEngaged = 0;
  for (const { r, m, rating } of umd) {
    const engaged = !!r.is_played || (r.play_count ?? 0) > 0 || !!r.is_favorite || rating != null;
    if (!engaged) continue;
    totalEngaged++;
    for (const g of m.genres) {
      const k = g.toLowerCase();
      const a = acc.get(k) ?? { name: g, sum: 0, n: 0, engaged: 0 };
      a.engaged++;
      if (rating != null) {
        a.sum += rating;
        a.n++;
      }
      acc.set(k, a);
    }
    const loved = !!r.is_favorite || (rating != null && rating >= highMovie && rating > userMean);
    if (loved) for (const t of m.lowerTags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }

  const genres = new Map<string, GenreStat>();
  const totalLib = lib.movies.size || 1;
  for (const [k, a] of acc) {
    // Rating term: shrunk (k=2 toward the user's mean) avg vs. the user's mean.
    const shrunk = a.n ? (a.sum + userMean * 2) / (a.n + 2) : userMean;
    const ratingTerm = a.n ? clamp((shrunk - userMean) / 1.5, -1, 1) : 0;
    // Engagement term: lift of the genre's share of what you engaged with over
    // its share of the library (so "Drama is everywhere" doesn't count),
    // damped for tiny samples.
    const lift = totalEngaged ? (a.engaged / totalEngaged) / ((lib.libGenre.get(k) ?? 1) / totalLib) : 0;
    const engagementTerm = clamp((lift - 1) / 1.5, -0.5, 1) * Math.min(1, a.engaged / 3);
    genres.set(k, {
      affinity: 0.6 * ratingTerm + 0.4 * engagementTerm,
      engaged: a.engaged,
      avg: a.n ? round1(a.sum / a.n) : null,
    });
  }

  // Tags shared by ≥ 2 loved movies, normalized to the most common one.
  const tags = new Map<string, number>();
  const maxTag = Math.max(0, ...tagCount.values());
  for (const [t, c] of tagCount) if (c >= 2) tags.set(t, c / maxTag);

  const pRows = db.all<{
    person_id: string;
    personal_rating: number | null;
    dimension_ratings: string | null;
    is_favorite: number | null;
  }>(sql`
    SELECT person_id, personal_rating, dimension_ratings, is_favorite
    FROM user_person_data WHERE user_id = ${userId}
  `);
  const peopleSig = new Map<string, PersonSignal>();
  for (const r of pRows) {
    const rating = effectiveRating(r.personal_rating, r.dimension_ratings);
    if (rating == null && !r.is_favorite) continue;
    peopleSig.set(r.person_id, { rating, isFavorite: !!r.is_favorite });
  }
  const highPerson = highThreshold(
    [...peopleSig.values()].map((p) => p.rating).filter((v): v is number => v != null)
  );

  return { genres, tags, people: peopleSig, highMovie, highPerson };
}

// ─── scoring ────────────────────────────────────────────────────

interface Term {
  v: number;
  reason?: RecommendReason;
}

interface ScoredMovie {
  c: Candidate;
  weight: number;
  reasons: RecommendReason[];
  primaryGenre: string | null; // lowercase
  leads: string[]; // person ids of the first LEAD_CAST billed actors
}

/** Strongest-first, one chip per code, 1–3 chips. */
function pickReasons(terms: Term[], fallback: RecommendReason): RecommendReason[] {
  const seen = new Set<string>();
  const out: RecommendReason[] = [];
  for (const t of [...terms].sort((a, b) => b.v - a.v)) {
    if (!t.reason || t.v <= 0 || seen.has(t.reason.code)) continue;
    seen.add(t.reason.code);
    out.push(t.reason);
    if (out.length === 3) break;
  }
  return out.length ? out : [fallback];
}

/**
 * Score = 1 + Σ terms, × recency penalty. Term magnitudes (≈ 0–1.5 each):
 *  quality        1.0·q  (q = (communityRating − 5) / 4, clamped 0–1; unknown 0.3) → highRating ≥ 7.5
 *  unwatched      0.15 filler                                                      → unwatched
 *  genre affinity 1.0·affinity of the movie's best genre                           → favGenre
 *  liked cast     favorited 1.0 / rated ≥ bar 0.5–1.0, × billing (1 / .7 / .4)     → favActor / ratedActor
 *  tags           filter-tag match 0.25 (+0.1/extra); else loved-tag affinity 0.5·s → matchesTag
 *  newly added    0.5 if added ≤ 30 days                                           → newlyAdded
 *  favorite       0.6 (rewatch 1.5)                                                → favorite
 * Preset biases:
 *  blind          weight = 1 + 0.3·q only (near-uniform); reasons still describe the card
 *  hiddenGems     quality 1.5·q, never-played +0.8, added > 90 days ago +0.6, no newly-added bonus
 *  rewatch        own rating ≥ bar +1.0–1.5, time since last play up to +0.8 (1 yr) → rewatch;
 *                 played < 30 days ago × 0.3
 *  quick          shorter is better: 1.2·clamp((120 − runtime) / 60) → short; unknown runtime × 0.6
 * Penalty (all but rewatch): played < 60 days ago × (0.15 + 0.85·days/60).
 */
function scoreMovie(c: Candidate, cast: CastEntry[], sig: Signals, f: RecommendFilters, now: number): ScoredMovie {
  const preset = f.preset;
  const terms: Term[] = [];
  const q = c.communityRating != null ? clamp((c.communityRating - 5) / 4, 0, 1) : 0.3;
  const highCommunity = c.communityRating != null && c.communityRating >= HIGH_COMMUNITY;

  terms.push({
    v: (preset === "hiddenGems" ? 1.5 : 1.0) * q,
    reason: highCommunity ? { code: "highRating", rating: round1(c.communityRating!) } : undefined,
  });

  const neverPlayed = !c.isPlayed && c.playCount === 0 && !c.lastPlayedAt;
  if (!c.isPlayed) {
    terms.push({ v: preset === "hiddenGems" && neverPlayed ? 0.8 : 0.15, reason: { code: "unwatched" } });
  }

  // Genre affinity — best genre wins.
  let bestGenre: { name: string; stat: GenreStat } | null = null;
  for (const g of c.genres) {
    const stat = sig.genres.get(g.toLowerCase());
    if (stat && (!bestGenre || stat.affinity > bestGenre.stat.affinity)) bestGenre = { name: g, stat };
  }
  if (bestGenre) {
    const showChip = bestGenre.stat.affinity >= 0.3 && bestGenre.stat.engaged >= 2;
    terms.push({
      v: Math.max(-0.5, bestGenre.stat.affinity),
      reason: showChip ? { code: "favGenre", genre: bestGenre.name, avg: bestGenre.stat.avg } : undefined,
    });
  }

  // Liked cast: strongest favorited + strongest highly-rated member, billing-weighted.
  let fav: Term | null = null;
  let rated: Term | null = null;
  let extraLiked = 0;
  for (let i = 0; i < cast.length; i++) {
    const e = cast[i];
    const ps = sig.people.get(e.personId);
    if (!ps) continue;
    const billing = i < LEAD_CAST ? 1 : i < 5 ? 0.7 : 0.4;
    let liked = false;
    if (ps.isFavorite) {
      liked = true;
      if (!fav || billing > fav.v) fav = { v: billing, reason: { code: "favActor", name: e.name } };
    }
    if (ps.rating != null && ps.rating >= sig.highPerson) {
      liked = true;
      const v = (0.5 + 0.5 * clamp((ps.rating - sig.highPerson) / Math.max(0.5, 10 - sig.highPerson), 0, 1)) * billing;
      if (!rated || v > rated.v) rated = { v, reason: { code: "ratedActor", name: e.name, rating: round1(ps.rating) } };
    }
    if (liked) extraLiked++;
  }
  if (fav) terms.push(fav);
  if (rated) terms.push(rated);
  if (extraLiked > 1) terms.push({ v: Math.min(0.45, 0.15 * (extraLiked - 1)) });

  // Tags: explicit filter tags explain the match; otherwise personal loved-tag affinity.
  const lowerTags = c.lowerTags;
  if (f.tags?.length) {
    const matched = f.tags.filter((t) => lowerTags.includes(t.toLowerCase()));
    if (matched.length) {
      terms.push({ v: 0.25 + 0.1 * (matched.length - 1), reason: { code: "matchesTag", tag: matched[0] } });
    }
  } else if (sig.tags.size) {
    let best: { tag: string; s: number } | null = null;
    for (let i = 0; i < c.tags.length; i++) {
      const s = sig.tags.get(lowerTags[i]);
      if (s && (!best || s > best.s)) best = { tag: c.tags[i], s };
    }
    if (best) {
      terms.push({ v: 0.5 * best.s, reason: best.s >= 0.5 ? { code: "matchesTag", tag: best.tag } : undefined });
    }
  }

  const addedDays = c.dateAddedMs != null ? (now - c.dateAddedMs) / DAY_MS : null;
  if (preset !== "hiddenGems" && addedDays != null && addedDays <= NEW_DAYS) {
    terms.push({ v: 0.5, reason: { code: "newlyAdded" } });
  }
  if (preset === "hiddenGems" && addedDays != null && addedDays > GEM_AGE_DAYS) terms.push({ v: 0.6 });

  if (c.isFavorite) terms.push({ v: preset === "rewatch" ? 1.5 : 0.6, reason: { code: "favorite" } });

  const playedDays = c.lastPlayedMs != null ? (now - c.lastPlayedMs) / DAY_MS : null;
  const lovedIt = c.personalRating != null && c.personalRating >= sig.highMovie;
  if (preset === "rewatch") {
    const rewatchReason: RecommendReason = { code: "rewatch", lastPlayedAt: c.lastPlayedAt };
    if (lovedIt) {
      const v = 1.0 + 0.5 * clamp((c.personalRating! - sig.highMovie) / Math.max(0.5, 10 - sig.highMovie), 0, 1);
      terms.push({ v, reason: rewatchReason });
    }
    const age = playedDays != null ? 0.8 * Math.min(1, playedDays / 365) : c.isPlayed ? 0.5 : 0;
    if (age > 0) terms.push({ v: age, reason: rewatchReason });
  } else if (c.isPlayed && lovedIt && (playedDays == null || playedDays > RECENT_PLAY_DAYS)) {
    terms.push({ v: 0.3, reason: { code: "rewatch", lastPlayedAt: c.lastPlayedAt } });
  }

  let factor = 1;
  if (preset === "quick") {
    if (c.runtimeMinutes) {
      terms.push({
        v: 1.2 * clamp((120 - c.runtimeMinutes) / 60, 0, 1),
        reason: c.runtimeMinutes <= 100 ? { code: "short", runtime: c.runtimeMinutes } : undefined,
      });
    } else factor *= 0.6;
  } else if (f.maxRuntime !== undefined && c.runtimeMinutes && c.runtimeMinutes <= 100) {
    terms.push({ v: 0.2, reason: { code: "short", runtime: c.runtimeMinutes } });
  }

  if (playedDays != null) {
    if (preset === "rewatch") {
      if (playedDays < 30) factor *= 0.3;
    } else if (playedDays < RECENT_PLAY_DAYS) {
      factor *= 0.15 + 0.85 * (Math.max(0, playedDays) / RECENT_PLAY_DAYS);
    }
  }

  const sum = terms.reduce((s, t) => s + t.v, 0);
  const weight = preset === "blind" ? 1 + 0.3 * q : Math.max(0.05, 1 + sum) * factor;

  const fallback: RecommendReason = c.isPlayed
    ? { code: "rewatch", lastPlayedAt: c.lastPlayedAt }
    : { code: "unwatched" };

  return {
    c,
    weight,
    reasons: pickReasons(terms, fallback),
    primaryGenre: c.primaryGenre,
    leads: cast.slice(0, LEAD_CAST).map((e) => e.personId),
  };
}

interface ActorAgg {
  personId: string;
  name: string;
  actor: ActorInfo;
  films: { m: ScoredMovie; billing: number }[];
  matchingCount: number;
  unwatchedCount: number;
  weight: number;
  reasons: RecommendReason[];
  signal: PersonSignal | undefined;
}

/**
 * Actors eligible iff they have a photo and ≥ 1 film in the filtered set where
 * they're main cast (first MAIN_CAST billed) — otherwise every bit part in the
 * library qualifies. People the user favorited / rated qualify via any credit.
 * matchingCount / unwatchedCount count only those qualifying films.
 * Score = 1 + 0.9·log2(1 + billing-weighted film count) + 0.4·log2(1 + unwatched)
 *         + favorite 1.2 + rated ≥ bar 0.4–0.8. Blind: 1 + 0.3·log2(1 + count).
 */
function buildActors(
  scored: ScoredMovie[],
  castMap: Map<string, CastEntry[]>,
  sig: Signals,
  f: RecommendFilters,
  ranked = true
): ActorAgg[] {
  const byId = new Map<string, ActorAgg>();
  for (const m of scored) {
    const cast = castMap.get(m.c.id) ?? [];
    cast.forEach((e, i) => {
      if (!e.actor.photo) return;
      if (!e.main && !sig.people.has(e.personId)) return;
      let a = byId.get(e.personId);
      if (!a) {
        a = {
          personId: e.personId,
          name: e.name,
          actor: e.actor,
          films: [],
          matchingCount: 0,
          unwatchedCount: 0,
          weight: 0,
          reasons: [],
          signal: sig.people.get(e.personId),
        };
        byId.set(e.personId, a);
      }
      a.films.push({ m, billing: i < 3 ? 1 : i < 8 ? 0.6 : 0.3 });
      a.matchingCount++;
      if (!m.c.isPlayed) a.unwatchedCount++;
    });
  }
  // The pool only needs who qualifies (and in what order) — skip weights / reasons.
  if (!ranked) return [...byId.values()];

  for (const a of byId.values()) {
    const weighted = a.films.reduce((s, x) => s + x.billing, 0);
    const terms: Term[] = [{ v: 0.9 * Math.log2(1 + weighted), reason: { code: "actorMatching", count: a.matchingCount } }];
    // When everything shown is unwatched anyway, the unwatched chip just repeats "matching".
    const redundant = (f.watched ?? "unwatched") === "unwatched" && a.unwatchedCount === a.matchingCount;
    terms.push({
      v: 0.4 * Math.log2(1 + a.unwatchedCount),
      reason: a.unwatchedCount > 0 && !redundant ? { code: "actorUnwatched", count: a.unwatchedCount } : undefined,
    });
    if (a.signal?.isFavorite) terms.push({ v: 1.2, reason: { code: "favActor", name: a.name } });
    if (a.signal?.rating != null && a.signal.rating >= sig.highPerson) {
      const v = 0.4 + 0.4 * clamp((a.signal.rating - sig.highPerson) / Math.max(0.5, 10 - sig.highPerson), 0, 1);
      terms.push({ v, reason: { code: "ratedActor", name: a.name, rating: round1(a.signal.rating) } });
    }
    a.weight = f.preset === "blind" ? 1 + 0.3 * Math.log2(1 + a.matchingCount) : 1 + terms.reduce((s, t) => s + t.v, 0);
    a.reasons = pickReasons(terms, { code: "actorMatching", count: a.matchingCount });
    // Best films first: movie score × billing.
    a.films.sort((x, y) => y.m.weight * y.billing - x.m.weight * x.billing);
  }
  return [...byId.values()];
}

// ─── context ────────────────────────────────────────────────────

interface Context {
  filters: RecommendFilters;
  scored: ScoredMovie[];
  actors: ActorAgg[];
  castMap: Map<string, CastEntry[]>;
}

/** Per-request reads shared by the movie and clip paths. */
interface RequestBase {
  /** may be swapped for a rebuilt snapshot mid-request (see buildContext / buildClips) */
  lib: Library;
  umdRows: UserMovieRow[];
}

const loadBase = (userId: string): RequestBase => ({ lib: getLibrary(), umdRows: loadUserMovieData(userId) });

/** `ranked: false` (the pool) skips scoring: the pile is a uniform sample, so only the sets matter. */
function buildContext(
  userId: string,
  filters: RecommendFilters,
  withActors: boolean,
  ranked = true,
  base: RequestBase = loadBase(userId)
): Context {
  const now = Date.now();
  const { umdRows } = base;
  let candidates = loadCandidates(filters, base.lib, umdRows);
  if (!candidates) {
    // A movie the snapshot doesn't know (written by another connection) → rebuild once.
    base.lib = getLibrary(true);
    candidates = loadCandidates(filters, base.lib, umdRows) ?? [];
  }
  const lib = base.lib;
  const castMap = lib.cast;
  const sig = loadSignals(userId, lib, umdRows);
  const scored = ranked
    ? candidates.map((c) => scoreMovie(c, castMap.get(c.id) ?? [], sig, filters, now))
    : candidates.map((c): ScoredMovie => ({ c, weight: 1, reasons: [], primaryGenre: c.primaryGenre, leads: [] }));
  const actors = withActors ? buildActors(scored, castMap, sig, filters, ranked) : [];
  return { filters, scored, actors, castMap };
}

// ─── clips (video bookmarks) ────────────────────────────────────
//
// The caller's own movie_bookmarks that have a thumbnail. Bookmarks are
// per-user data, so they are read on every request (idx_mb_user_movie) and
// never enter the library snapshot. Filters apply through the parent movie;
// `watched` and `maxRuntime` are ignored (a bookmark implies a play, and the
// clip is a moment, not a 2-hour commitment).

interface Clip {
  id: string;
  movie: MovieStatic;
  timestampSeconds: number;
  discNumber: number;
  iconType: string;
  tags: string[];
  note: string | null;
  thumbnail: string;
  thumbnailAspect: number | null;
  viewState: string | null;
  createdAt: string;
  /** the filter tag that matched the bookmark's OWN tags (→ bookmarkTag chip), if any */
  tagMatch: string | null;
}

interface ScoredClip {
  clip: Clip;
  weight: number;
  reasons: RecommendReason[];
  personalRating: number | null; // of the parent movie (effective)
}

/** The bookmark frame. Thumbnails are written once under the bookmark's own id
 *  and never replaced, so there is no mtime to stamp (and no stat). */
const stillOf = (c: Clip) => stampPath(resolveDataPath(c.thumbnail));

function parseViewState(json: string | null): ClipCardData["viewState"] {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    const { lon, lat, fov } = v ?? {};
    return typeof lon === "number" && typeof lat === "number" && typeof fov === "number" ? { lon, lat, fov } : null;
  } catch {
    return null;
  }
}

/**
 * Hard filters → one SQL pass over the caller's bookmarks (movie-type
 * libraries only, allowlist). Tags match the parent movie's tags OR the
 * bookmark's own. Returns null when a parent is missing from `lib` (stale
 * snapshot — the caller rebuilds and retries).
 */
function loadClips(userId: string, f: RecommendFilters, lib: Library): Clip[] | null {
  const where: SQL[] = [sql`mb.user_id = ${userId}`, sql`mb.thumbnail_path IS NOT NULL`, sql`mb.thumbnail_path != ''`];
  if (f.libraryId) where.push(sql`m.media_library_id = ${f.libraryId}`);
  if (f.genres?.length) where.push(jsonArrayAnyOf(sql`m.genres`, f.genres));
  if (f.tags?.length) where.push(sql`(${jsonArrayAnyOf(sql`m.tags`, f.tags)} OR ${jsonArrayAnyOf(sql`mb.tags`, f.tags)})`);
  if (f.minRating !== undefined) where.push(sql`m.community_rating >= ${f.minRating}`);
  if (f.yearFrom !== undefined) where.push(sql`m.year >= ${f.yearFrom}`);
  if (f.yearTo !== undefined) where.push(sql`m.year <= ${f.yearTo}`);

  const rows = db.all<{
    id: string;
    movie_id: string;
    timestamp_seconds: number;
    disc_number: number | null;
    icon_type: string | null;
    tags: string | null;
    note: string | null;
    thumbnail_path: string;
    thumbnail_aspect: number | null;
    view_state: string | null;
    created_at: string;
  }>(sql`
    SELECT mb.id, mb.movie_id, mb.timestamp_seconds, mb.disc_number, mb.icon_type, mb.tags, mb.note,
      mb.thumbnail_path, mb.thumbnail_aspect, mb.view_state, mb.created_at
    FROM movie_bookmarks mb
    INNER JOIN movies m ON m.id = mb.movie_id
    INNER JOIN media_libraries ml ON ml.id = m.media_library_id AND ml.type = 'movie'
    WHERE ${sql.join(where, sql` AND `)}
  `);

  const filterTags = f.tags?.map((t) => ({ t, lower: t.toLowerCase() })) ?? [];
  const out: Clip[] = [];
  for (const r of rows) {
    const movie = lib.movies.get(r.movie_id);
    if (!movie) return null;
    const tags = parseStringArray(r.tags);
    let tagMatch: string | null = null;
    if (filterTags.length && tags.length) {
      const lower = tags.map((t) => t.toLowerCase());
      tagMatch = filterTags.find((x) => lower.includes(x.lower))?.t ?? null;
    }
    out.push({
      id: r.id,
      movie,
      timestampSeconds: r.timestamp_seconds,
      discNumber: r.disc_number ?? 1,
      iconType: r.icon_type || "bookmark",
      tags,
      note: r.note,
      thumbnail: r.thumbnail_path,
      thumbnailAspect: r.thumbnail_aspect && r.thumbnail_aspect > 0 ? r.thumbnail_aspect : null,
      viewState: r.view_state,
      createdAt: r.created_at,
      tagMatch,
    });
  }
  return out;
}

/**
 * Clip score = 1 + rediscovery min(1, age / 180 days) + 0.5 if the parent is
 * favorited or rated in the user's high band (highThreshold) + 0.25 for a
 * bookmark-tag match. Blind: uniform (1). Reasons: bookmarkMoment always
 * first, then bookmarkTag / favorite / highRating (the parent's community
 * rating ≥ HIGH_COMMUNITY, as on movie cards), max 3.
 */
function scoreClips(clips: Clip[], base: RequestBase, f: RecommendFilters, now: number): ScoredClip[] {
  const umd = new Map<string, UserMovieRow>();
  const rated: number[] = [];
  for (const r of base.umdRows) {
    if (!base.lib.movies.has(r.movie_id)) continue; // movie-type libraries only (= loadSignals)
    umd.set(r.movie_id, r);
    const v = effectiveRating(r.personal_rating, r.dimension_ratings);
    if (v != null) rated.push(v);
  }
  const highMovie = highThreshold(rated);

  return clips.map((clip) => {
    const r = umd.get(clip.movie.id);
    const personalRating = r ? effectiveRating(r.personal_rating, r.dimension_ratings) : null;
    const isFavorite = !!r?.is_favorite;
    const loved = personalRating != null && personalRating >= highMovie;
    const createdMs = parseDbDate(clip.createdAt);
    const ageDays = createdMs != null ? Math.max(0, (now - createdMs) / DAY_MS) : 0;

    const weight =
      f.preset === "blind"
        ? 1
        : 1 + Math.min(1, ageDays / CLIP_AGE_FULL_DAYS) + (isFavorite || loved ? 0.5 : 0) + (clip.tagMatch ? 0.25 : 0);

    const reasons: RecommendReason[] = [
      { code: "bookmarkMoment", timestampSeconds: clip.timestampSeconds, createdAt: clip.createdAt },
    ];
    if (clip.tagMatch) reasons.push({ code: "bookmarkTag", tag: clip.tagMatch });
    if (isFavorite) reasons.push({ code: "favorite" });
    // highRating = community rating, same meaning as on movie cards (the
    // personal-rating boost above stays unexplained rather than mislabelled)
    const community = clip.movie.communityRating;
    if (community != null && community >= HIGH_COMMUNITY && reasons.length < 3) {
      reasons.push({ code: "highRating", rating: round1(community) });
    }

    return { clip, weight, reasons, personalRating };
  });
}

/** Eligible clips for the filters; `ranked: false` (the pool) skips scoring. */
function buildClips(userId: string, filters: RecommendFilters, base: RequestBase, ranked = true): ScoredClip[] {
  let clips = loadClips(userId, filters, base.lib);
  if (!clips) {
    base.lib = getLibrary(true);
    clips = loadClips(userId, filters, base.lib) ?? [];
  }
  return ranked
    ? scoreClips(clips, base, filters, Date.now())
    : clips.map((clip) => ({ clip, weight: 1, reasons: [], personalRating: null }));
}

/** posterBlur is filled in by attachBlurs once the hand is final. */
function clipCard(s: ScoredClip): ClipCardData {
  const c = s.clip;
  const m = c.movie;
  return {
    type: "bookmark",
    id: c.id,
    movieId: m.id,
    movieTitle: m.title,
    year: m.year,
    posterPath: posterOf(m),
    posterBlur: null,
    fanartPath: fanartOf(m),
    stillPath: stillOf(c),
    stillAspect: c.thumbnailAspect ?? DEFAULT_STILL_ASPECT,
    timestampSeconds: c.timestampSeconds,
    discNumber: c.discNumber,
    iconType: c.iconType,
    tags: [...c.tags],
    note: c.note,
    viewState: parseViewState(c.viewState),
    createdAt: c.createdAt,
    personalRating: s.personalRating,
    reasons: s.reasons,
  };
}

/** True when bookmark `id` belongs to `userId` (history writes are scoped to own bookmarks). */
export function ownsBookmark(userId: string, id: string): boolean {
  return !!db.get<{ one: number }>(sql`SELECT 1 AS one FROM movie_bookmarks WHERE id = ${id} AND user_id = ${userId}`);
}

// ─── pool ───────────────────────────────────────────────────────

export interface PoolOptions {
  /** Deterministic sample: the top-N items by seedRank(seed, item) instead of a
   *  random N. The top-N of a narrower filter keeps every still-matching item
   *  of the wider one, so a filter change only swaps real leavers/newcomers. */
  seed?: string;
  rng?: Rng;
}

/** `n` items of `items` — seeded top-n by rank (rank kept for ordering), else a random n. */
function samplePool<T>(items: T[], n: number, key: (t: T) => string, opts: PoolOptions): { item: T; rank: number }[] {
  const { seed, rng = Math.random } = opts;
  if (seed === undefined) return shuffle([...items], rng).slice(0, n).map((item) => ({ item, rank: 0 }));
  return items
    .map((item) => ({ item, rank: seedRank(seed, key(item)) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, n);
}

/**
 * The visual pile: uniform sample of the filtered pool (no de-dup) — random, or
 * deterministic per `opts.seed` (see PoolOptions).
 * Mixed piles keep roughly the hand's 4:1 movie:actor ratio (at least a few
 * actors) — proportional to raw counts would bury the movies, since every film
 * contributes a dozen cast members. Actor piles top up with movies when there
 * are fewer than POOL_CAP actors (the hand falls back to movies the same way).
 * Clip piles hold only clips (no movie top-up — a clip hand doesn't fall back
 * either); mixed piles carry up to POOL_MIXED_CLIPS clips out of the movie share.
 */
export function getPool(userId: string, filters: RecommendFilters, opts: PoolOptions = {}): PoolResponse {
  const mix = filters.mix ?? "mixed";
  const base = loadBase(userId);
  const ctx = buildContext(userId, filters, mix === "mixed" || mix === "actors", false, base);
  const clips = mix === "mixed" || mix === "clips" ? buildClips(userId, filters, base, false) : [];
  const M = ctx.scored.length;
  const A = ctx.actors.length;
  const C = clips.length;

  let actorSlots = 0;
  if (mix === "actors") actorSlots = Math.min(A, POOL_CAP);
  else if (mix === "mixed") actorSlots = Math.min(A, Math.max(6, Math.round(Math.min(POOL_CAP, M + A) * 0.2)));
  const clipSlots = mix === "clips" ? Math.min(C, POOL_CAP) : Math.min(C, POOL_MIXED_CLIPS);
  const movieSlots = mix === "clips" ? 0 : Math.min(M, POOL_CAP - actorSlots - clipSlots);

  const movies = samplePool(ctx.scored, movieSlots, (m) => `movie:${m.c.id}`, opts);
  const actors = samplePool(ctx.actors, actorSlots, (a) => `person:${a.personId}`, opts);
  const clipSample = samplePool(clips, clipSlots, (s) => `bookmark:${s.clip.id}`, opts);
  const { movieBlur, personBlur } = loadBlurs(
    [...movies.map(({ item: m }) => m.c.id), ...clipSample.map(({ item: s }) => s.clip.movie.id)],
    actors.map(({ item: a }) => a.personId)
  );
  const items: { item: PoolItem; rank: number }[] = [
    ...movies.map(({ item: m, rank }) => ({
      rank,
      item: {
        type: "movie" as const,
        id: m.c.id,
        title: m.c.title,
        image: posterOf(m.c),
        blur: movieBlur.get(m.c.id) ?? null,
      },
    })),
    ...actors.map(({ item: a, rank }) => ({
      rank,
      item: {
        type: "person" as const,
        id: a.personId,
        title: a.name,
        image: photoOf(a.actor),
        blur: personBlur.get(a.personId) ?? null,
      },
    })),
    ...clipSample.map(({ item: s, rank }) => ({
      rank,
      item: {
        type: "bookmark" as const,
        id: s.clip.id,
        title: s.clip.movie.title,
        image: posterOf(s.clip.movie),
        blur: movieBlur.get(s.clip.movie.id) ?? null,
        still: stillOf(s.clip),
        stillAspect: s.clip.thumbnailAspect ?? DEFAULT_STILL_ASPECT,
      },
    })),
  ];
  // seeded: interleave by rank, so the order is stable too (vortex fills its caps in pool order)
  const ordered =
    opts.seed === undefined ? shuffle(items, opts.rng ?? Math.random) : items.sort((a, b) => a.rank - b.rank);
  return { movieCount: M, actorCount: A, clipCount: C, items: ordered.map((x) => x.item) };
}

// ─── history ────────────────────────────────────────────────────

interface HistoryState {
  /** held back by the cooldowns → sort key for re-admission (lower = sooner) */
  blocked: Map<string, { dismissed: boolean; at: string }>;
}

const refKey = (type: string, id: string) => `${type}:${id}`;

function loadHistory(userId: string): HistoryState {
  const rows = db.all<{ item_type: string; item_id: string; action: string; last: string; recent: number }>(sql`
    SELECT item_type, item_id, action, MAX(created_at) AS last,
      MAX(created_at) >= datetime('now', ${`-${SHOWN_COOLDOWN_DAYS} days`}) AS recent
    FROM recommendation_history
    WHERE user_id = ${userId} AND created_at >= datetime('now', ${`-${DISMISS_COOLDOWN_DAYS} days`})
    GROUP BY item_type, item_id, action
  `);
  const blocked = new Map<string, { dismissed: boolean; at: string }>();
  for (const r of rows) {
    const k = refKey(r.item_type, r.item_id);
    if (r.action === "dismissed") {
      // Dismissed within 90 days (query window) always blocks and sorts last.
      blocked.set(k, { dismissed: true, at: r.last });
    } else if (r.action === "shown" && r.recent && !blocked.get(k)?.dismissed) {
      blocked.set(k, { dismissed: false, at: r.last });
    }
  }
  return { blocked };
}

/** Same ordering as `a.localeCompare(b)`, without re-resolving the locale per call. */
const collator = new Intl.Collator();

/**
 * Re-admission order: shown-only before dismissed, then oldest first. Sort
 * keys are looked up once per item, not per comparison (thousands of blocked
 * items at scale).
 */
function sortReadmit<T>(items: T[], h: HistoryState, key: (item: T) => string): T[] {
  const keyed = items.map((item) => {
    const b = h.blocked.get(key(item))!;
    return { item, d: b.dismissed ? 1 : 0, at: b.at };
  });
  keyed.sort((a, b) => a.d - b.d || collator.compare(a.at, b.at));
  return keyed.map((x) => x.item);
}

function writeShown(userId: string, cards: RecommendCard[]) {
  if (!cards.length) return;
  db.transaction((tx) => {
    tx.insert(recommendationHistory)
      .values(cards.map((c) => ({ id: uuidv4(), userId, itemType: c.type, itemId: c.id, action: "shown" as const })))
      .run();
    tx.delete(recommendationHistory)
      .where(
        and(
          eq(recommendationHistory.userId, userId),
          lt(recommendationHistory.createdAt, sql`datetime('now', ${`-${HISTORY_RETENTION_DAYS} days`})`)
        )
      )
      .run();
  });
}

export function recordHistory(userId: string, req: HistoryRequest) {
  db.insert(recommendationHistory)
    .values({ id: uuidv4(), userId, itemType: req.type, itemId: req.id, action: req.action })
    .run();
}

// ─── draw ───────────────────────────────────────────────────────

/** Greedy pick over an ordered list with escalating relaxation levels. */
function greedyPick<T>(
  lists: T[][],
  need: number,
  levels: number,
  accept: (item: T, level: number) => boolean,
  commit: (item: T) => void,
  key: (item: T) => string,
  taken: Set<string>
): T[] {
  const out: T[] = [];
  for (const list of lists) {
    for (let level = 0; level < levels && out.length < need; level++) {
      for (const item of list) {
        if (out.length >= need) break;
        const k = key(item);
        if (taken.has(k) || !accept(item, level)) continue;
        taken.add(k);
        out.push(item);
        commit(item);
      }
    }
  }
  return out;
}

/** posterBlur is filled in by attachBlurs once the hand is final. */
function movieCard(m: ScoredMovie): MovieCardData {
  const c = m.c;
  return {
    type: "movie",
    id: c.id,
    title: c.title,
    year: c.year,
    rating: c.communityRating,
    personalRating: c.personalRating,
    runtimeMinutes: c.runtimeMinutes,
    genres: [...c.genres], // the snapshot's array is shared — never hand it out
    posterPath: posterOf(c),
    posterBlur: null,
    fanartPath: fanartOf(c),
    isPlayed: c.isPlayed,
    isFavorite: c.isFavorite,
    reasons: m.reasons,
  };
}

/** Fills the blur placeholders of a final hand (incl. actor cards' films, clips' parents) in one lookup. */
function attachBlurs(cards: RecommendCard[]) {
  const movieCards = cards.flatMap((c) => (c.type === "movie" ? [c] : c.type === "person" ? c.films : []));
  const actorCards = cards.filter((c): c is ActorCardData => c.type === "person");
  const clipCards = cards.filter((c): c is ClipCardData => c.type === "bookmark");
  const { movieBlur, personBlur } = loadBlurs(
    [...movieCards.map((c) => c.id), ...clipCards.map((c) => c.movieId)],
    actorCards.map((c) => c.id)
  );
  for (const c of movieCards) c.posterBlur = movieBlur.get(c.id) ?? null;
  for (const c of actorCards) c.photoBlur = personBlur.get(c.id) ?? null;
  for (const c of clipCards) c.posterBlur = movieBlur.get(c.movieId) ?? null;
}

export interface DrawOptions {
  rng?: Rng;
  /** write 'shown' history rows (default true) */
  record?: boolean;
}

export function drawHand(userId: string, req: DrawRequest, opts: DrawOptions = {}): DrawResponse {
  const rng = opts.rng ?? Math.random;
  const filters = req.filters;
  const exclude = req.exclude ?? [];
  const excluded = new Set(exclude.map((r: RecommendItemRef) => refKey(r.type, r.id)));
  const excludedMovieIds = exclude.filter((r) => r.type === "movie").map((r) => r.id);
  const excludedClipIds = exclude.filter((r) => r.type === "bookmark").map((r) => r.id);
  const clipCount = req.clips ?? 0;
  const tryWildcard = !!req.clipWildcard && req.movies > 0;
  // The request's movies/actors/clips counts (not filters.mix) decide the hand's shape.
  const base = loadBase(userId);
  const ctx: Context =
    req.movies > 0 || req.actors > 0
      ? buildContext(userId, filters, req.actors > 0, true, base)
      : { filters, scored: [], actors: [], castMap: base.lib.cast };
  const clips = clipCount > 0 || tryWildcard ? buildClips(userId, filters, base) : [];
  const history = loadHistory(userId);

  // Parent films of locked clips: no second clip of them, and no movie card of them.
  const clipParents = new Set<string>();
  if (excludedClipIds.length) {
    const rows = db.all<{ movie_id: string }>(sql`
      SELECT movie_id FROM movie_bookmarks
      WHERE user_id = ${userId} AND id IN (${sql.join(excludedClipIds.map((id) => sql`${id}`), sql`, `)})
    `);
    for (const r of rows) clipParents.add(r.movie_id);
  }

  // ── Diversity state, seeded with locked movies so the new cards fit around them.
  const genreCount = new Map<string, number>();
  const leadSet = new Set<string>();
  const usedMovieIds = new Set<string>([...excludedMovieIds, ...clipParents]);
  const scoredById = new Map(ctx.scored.map((m) => [m.c.id, m]));
  if (excludedMovieIds.length) {
    const lockedGenres = new Map<string, string | null>();
    const outside = excludedMovieIds.filter((id) => !scoredById.has(id));
    for (const m of excludedMovieIds) {
      const s = scoredById.get(m);
      if (s) lockedGenres.set(m, s.primaryGenre);
    }
    if (outside.length) {
      const rows = db.all<{ id: string; genres: string | null }>(sql`
        SELECT id, genres FROM movies WHERE id IN (${sql.join(outside.map((id) => sql`${id}`), sql`, `)})
      `);
      for (const r of rows) lockedGenres.set(r.id, parseStringArray(r.genres)[0]?.toLowerCase() ?? null);
    }
    for (const [id, g] of lockedGenres) {
      if (g) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
      for (const p of (ctx.castMap.get(id) ?? []).slice(0, LEAD_CAST)) leadSet.add(p.personId);
    }
  }

  let repeats = false;
  const isRepeat = new Set<string>();

  // ── Movie order: fresh by weighted-random key, then blocked oldest-first.
  const freshMovies: ScoredMovie[] = [];
  const blockedMovies: ScoredMovie[] = [];
  for (const m of ctx.scored) {
    const k = refKey("movie", m.c.id);
    if (excluded.has(k)) continue;
    if (history.blocked.has(k)) blockedMovies.push(m);
    else freshMovies.push(m);
  }
  const keyed = freshMovies.map((m) => ({ m, k: esKey(m.weight, rng) }));
  keyed.sort((a, b) => b.k - a.k);
  const freshOrder = keyed.map((x) => x.m);
  const blockedOrder = sortReadmit(blockedMovies, history, (m) => refKey("movie", m.c.id));
  for (const m of blockedOrder) isRepeat.add(m.c.id);

  const takenMovies = new Set<string>(excludedMovieIds);
  const acceptMovie = (m: ScoredMovie, level: number) => {
    if (usedMovieIds.has(m.c.id)) return false;
    if (level >= 2) return true;
    if (m.primaryGenre && (genreCount.get(m.primaryGenre) ?? 0) >= MAX_PER_PRIMARY_GENRE) return false;
    if (level === 0 && m.leads.some((p) => leadSet.has(p))) return false;
    return true;
  };
  const commitMovie = (m: ScoredMovie) => {
    usedMovieIds.add(m.c.id);
    if (m.primaryGenre) genreCount.set(m.primaryGenre, (genreCount.get(m.primaryGenre) ?? 0) + 1);
    for (const p of m.leads) leadSet.add(p);
    if (isRepeat.has(m.c.id)) repeats = true;
  };
  const pickMovies = (n: number) =>
    n > 0 ? greedyPick([freshOrder, blockedOrder], n, 3, acceptMovie, commitMovie, (m) => m.c.id, takenMovies) : [];

  // ── Clip order: same fresh/blocked split as movies.
  const freshClips: ScoredClip[] = [];
  const blockedClips: ScoredClip[] = [];
  for (const s of clips) {
    const k = refKey("bookmark", s.clip.id);
    if (excluded.has(k)) continue;
    (history.blocked.has(k) ? blockedClips : freshClips).push(s);
  }
  const freshClipOrder = freshClips
    .map((s) => ({ s, k: esKey(s.weight, rng) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.s);
  const blockedClipOrder = sortReadmit(blockedClips, history, (s) => refKey("bookmark", s.clip.id));
  const repeatClips = new Set(blockedClipOrder.map((s) => s.clip.id));

  // Mixed-hand wildcard: sometimes one movie slot holds a clip instead — only
  // from fresh clips, so it never forces a repeat.
  const wildcard = tryWildcard && freshClipOrder.length >= CLIP_WILDCARD_MIN && rng() < CLIP_WILDCARD_P;

  const handMovies = pickMovies(req.movies - (wildcard ? 1 : 0));

  // ── Actors: same fresh/blocked split; each needs ≥ 1 film not already in the hand.
  const actorCards: ActorCardData[] = [];
  if (req.actors > 0 && ctx.actors.length) {
    const freshA: ActorAgg[] = [];
    const blockedA: ActorAgg[] = [];
    for (const a of ctx.actors) {
      const k = refKey("person", a.personId);
      if (excluded.has(k)) continue;
      (history.blocked.has(k) ? blockedA : freshA).push(a);
    }
    const keyedA = freshA.map((a) => ({ a, k: esKey(a.weight, rng) })).sort((x, y) => y.k - x.k);
    const blockedOrderA = sortReadmit(blockedA, history, (a) => refKey("person", a.personId));
    const repeatActors = new Set(blockedOrderA.map((a) => a.personId));
    const handLeads = new Set(handMovies.flatMap((m) => m.leads));
    const availableFilms = (a: ActorAgg) => a.films.filter((x) => !usedMovieIds.has(x.m.c.id));

    greedyPick(
      [keyedA.map((x) => x.a), blockedOrderA],
      req.actors,
      3,
      (a, level) => {
        const n = availableFilms(a).length;
        if (level === 0) return n >= 2 && !handLeads.has(a.personId);
        if (level === 1) return n >= 2;
        return n >= 1;
      },
      (a) => {
        // Reserve the actor's films so later actor cards / filler movies don't duplicate them.
        const films = availableFilms(a).slice(0, ACTOR_FILMS);
        for (const x of films) usedMovieIds.add(x.m.c.id);
        if (repeatActors.has(a.personId)) repeats = true;
        const withFanart = films.find((x) => x.m.c.hasFanart) ?? a.films.find((x) => x.m.c.hasFanart);
        const topFanart = withFanart ? fanartOf(withFanart.m.c) : null;
        actorCards.push({
          type: "person",
          id: a.personId,
          name: a.name,
          photoPath: photoOf(a.actor),
          photoBlur: null,
          fanartPath: topFanart,
          personalRating: a.signal?.rating ?? null,
          isFavorite: a.signal?.isFavorite ?? false,
          matchingCount: a.matchingCount,
          unwatchedCount: a.unwatchedCount,
          films: films.map((x) => movieCard(x.m)),
          reasons: a.reasons,
        });
      },
      (a) => a.personId,
      new Set()
    );
  }

  // ── Not enough actors → fill the remaining slots with movies so the hand stays full.
  const filler = pickMovies(req.actors - actorCards.length);

  // ── Clips: ≤ 1 per parent film (relaxed only if the hand can't be filled),
  // never one whose film is a movie card in this hand (locked or new).
  const movieCardIds = new Set([...excludedMovieIds, ...handMovies.map((m) => m.c.id), ...filler.map((m) => m.c.id)]);
  const takenClips = new Set<string>();
  const acceptClip = (s: ScoredClip, level: number) => {
    const parent = s.clip.movie.id;
    if (movieCardIds.has(parent)) return false;
    return level >= 1 || !clipParents.has(parent);
  };
  const commitClip = (s: ScoredClip) => {
    clipParents.add(s.clip.movie.id);
    if (repeatClips.has(s.clip.id)) repeats = true;
  };
  const clipKey = (s: ScoredClip) => s.clip.id;
  const handClips =
    clipCount > 0
      ? greedyPick([freshClipOrder, blockedClipOrder], clipCount, 2, acceptClip, commitClip, clipKey, takenClips)
      : [];
  if (wildcard) {
    const wild = greedyPick([freshClipOrder], 1, 2, acceptClip, commitClip, clipKey, takenClips);
    handClips.push(...wild);
    // No clip fits around the dealt films → the slot goes back to a movie.
    if (!wild.length) {
      for (const p of clipParents) usedMovieIds.add(p);
      filler.push(...pickMovies(1));
    }
  }

  const cards: RecommendCard[] = [...handMovies, ...filler].map(movieCard);
  cards.push(...actorCards);
  cards.push(...handClips.map(clipCard));
  attachBlurs(cards);

  if (opts.record !== false) writeShown(userId, cards);
  return { cards, repeatsAllowed: repeats };
}

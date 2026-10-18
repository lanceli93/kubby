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

export { parseFiltersFromSearchParams, parseDrawRequest, parseHistoryRequest, sanitizeFilters } from "./parse";

type Rng = () => number;

const DAY_MS = 86_400_000;
/** A 'shown' card is held back this long. */
export const SHOWN_COOLDOWN_DAYS = 30;
/** A 'dismissed' card is held back this long (and re-admitted last). */
export const DISMISS_COOLDOWN_DAYS = 90;
/** History rows older than this are pruned on draw. */
export const HISTORY_RETENTION_DAYS = 120;
const POOL_CAP = 120;
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

/** `ranked: false` (the pool) skips scoring: the pile is a uniform sample, so only the sets matter. */
function buildContext(userId: string, filters: RecommendFilters, withActors: boolean, ranked = true): Context {
  const now = Date.now();
  let lib = getLibrary();
  const umdRows = loadUserMovieData(userId);
  let candidates = loadCandidates(filters, lib, umdRows);
  if (!candidates) {
    // A movie the snapshot doesn't know (written by another connection) → rebuild once.
    lib = getLibrary(true);
    candidates = loadCandidates(filters, lib, umdRows) ?? [];
  }
  const castMap = lib.cast;
  const sig = loadSignals(userId, lib, umdRows);
  const scored = ranked
    ? candidates.map((c) => scoreMovie(c, castMap.get(c.id) ?? [], sig, filters, now))
    : candidates.map((c): ScoredMovie => ({ c, weight: 1, reasons: [], primaryGenre: c.primaryGenre, leads: [] }));
  const actors = withActors ? buildActors(scored, castMap, sig, filters, ranked) : [];
  return { filters, scored, actors, castMap };
}

// ─── pool ───────────────────────────────────────────────────────

/**
 * The visual pile: uniform random sample of the filtered pool (no de-dup).
 * Mixed piles keep roughly the hand's 4:1 movie:actor ratio (at least a few
 * actors) — proportional to raw counts would bury the movies, since every film
 * contributes a dozen cast members. Actor piles top up with movies when there
 * are fewer than POOL_CAP actors (the hand falls back to movies the same way).
 */
export function getPool(userId: string, filters: RecommendFilters, rng: Rng = Math.random): PoolResponse {
  const ctx = buildContext(userId, filters, (filters.mix ?? "mixed") !== "movies", false);
  const M = ctx.scored.length;
  const A = ctx.actors.length;
  const mix = filters.mix ?? "mixed";

  let actorSlots = 0;
  if (mix === "actors") actorSlots = Math.min(A, POOL_CAP);
  else if (mix === "mixed") actorSlots = Math.min(A, Math.max(6, Math.round(Math.min(POOL_CAP, M + A) * 0.2)));
  const movieSlots = Math.min(M, POOL_CAP - actorSlots);

  const movies = shuffle([...ctx.scored], rng).slice(0, movieSlots);
  const actors = shuffle([...ctx.actors], rng).slice(0, actorSlots);
  const { movieBlur, personBlur } = loadBlurs(
    movies.map((m) => m.c.id),
    actors.map((a) => a.personId)
  );
  const movieItems: PoolItem[] = movies.map((m) => ({
    type: "movie",
    id: m.c.id,
    title: m.c.title,
    image: posterOf(m.c),
    blur: movieBlur.get(m.c.id) ?? null,
  }));
  const actorItems: PoolItem[] = actors.map((a) => ({
    type: "person",
    id: a.personId,
    title: a.name,
    image: photoOf(a.actor),
    blur: personBlur.get(a.personId) ?? null,
  }));

  return { movieCount: M, actorCount: A, items: shuffle([...movieItems, ...actorItems], rng) };
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

/** Fills the blur placeholders of a final hand (incl. actor cards' films) in one lookup. */
function attachBlurs(cards: RecommendCard[]) {
  const movieCards = cards.flatMap((c) => (c.type === "movie" ? [c] : c.films));
  const actorCards = cards.filter((c): c is ActorCardData => c.type === "person");
  const { movieBlur, personBlur } = loadBlurs(
    movieCards.map((c) => c.id),
    actorCards.map((c) => c.id)
  );
  for (const c of movieCards) c.posterBlur = movieBlur.get(c.id) ?? null;
  for (const c of actorCards) c.photoBlur = personBlur.get(c.id) ?? null;
}

export interface DrawOptions {
  rng?: Rng;
  /** write 'shown' history rows (default true) */
  record?: boolean;
}

export function drawHand(userId: string, req: DrawRequest, opts: DrawOptions = {}): DrawResponse {
  const rng = opts.rng ?? Math.random;
  const filters = req.filters;
  const excluded = new Set((req.exclude ?? []).map((r: RecommendItemRef) => refKey(r.type, r.id)));
  const excludedMovieIds = (req.exclude ?? []).filter((r) => r.type === "movie").map((r) => r.id);
  // The request's movies/actors counts (not filters.mix) decide the hand's shape.
  const ctx = buildContext(userId, filters, req.actors > 0);
  const history = loadHistory(userId);

  // ── Diversity state, seeded with locked movies so the new cards fit around them.
  const genreCount = new Map<string, number>();
  const leadSet = new Set<string>();
  const usedMovieIds = new Set<string>(excludedMovieIds);
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

  const handMovies = pickMovies(req.movies);

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

  const cards: RecommendCard[] = [...handMovies, ...filler].map(movieCard);
  cards.push(...actorCards);
  attachBlurs(cards);

  if (opts.record !== false) writeShown(userId, cards);
  return { cards, repeatsAllowed: repeats };
}

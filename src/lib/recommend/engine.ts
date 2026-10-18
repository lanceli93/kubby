// 今晚看什么 recommendation engine (server-only: imports the DB).
//
// Pipeline per request:
//   1. Hard filters → one SQL pass over `movies` (movie-type libraries only —
//      allowlist, never a blocklist) left-joined with the caller's user data.
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
// Personal libraries are hundreds–low-thousands of movies, so everything is a
// handful of batched queries + in-memory scoring (no N+1).

import path from "path";
import { and, eq, lt, sql, type SQL } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
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

// ─── data loading ───────────────────────────────────────────────

interface Candidate {
  id: string;
  title: string;
  year: number | null;
  communityRating: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  tags: string[];
  posterPath: string | null; // stamped
  posterBlur: string | null;
  fanartPath: string | null; // stamped
  dateAddedMs: number | null;
  isPlayed: boolean;
  isFavorite: boolean;
  playCount: number;
  personalRating: number | null; // effective (dims fallback)
  lastPlayedAt: string | null;
  lastPlayedMs: number | null;
}

interface CastEntry {
  personId: string;
  name: string;
  photoPath: string | null; // stamped
  photoBlur: string | null;
  /** among the first MAIN_CAST billed (NULL sortOrder = not main, unless the movie has no order data at all) */
  main: boolean;
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

/** Throws nothing; an invalid / non-movie libraryId just yields no candidates. */
function loadCandidates(userId: string, f: RecommendFilters): Candidate[] {
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
  if (watched === "unwatched") where.push(sql`COALESCE(umd.is_played, 0) = 0`);
  else if (watched === "watched") where.push(sql`umd.is_played = 1`);

  const rows = db.all<{
    id: string;
    title: string;
    year: number | null;
    community_rating: number | null;
    runtime_minutes: number | null;
    genres: string | null;
    tags: string | null;
    folder_path: string;
    poster_path: string;
    poster_mtime: number | null;
    poster_blur: string | null;
    fanart_path: string | null;
    fanart_mtime: number | null;
    date_added: string | null;
    is_played: number | null;
    is_favorite: number | null;
    play_count: number | null;
    personal_rating: number | null;
    dimension_ratings: string | null;
    last_played_at: string | null;
  }>(sql`
    SELECT m.id, m.title, m.year, m.community_rating, m.runtime_minutes, m.genres, m.tags,
      m.folder_path, m.poster_path, m.poster_mtime, m.poster_blur, m.fanart_path, m.fanart_mtime,
      m.date_added, umd.is_played, umd.is_favorite, umd.play_count, umd.personal_rating,
      umd.dimension_ratings, umd.last_played_at
    FROM movies m
    INNER JOIN media_libraries ml ON ml.id = m.media_library_id AND ml.type = 'movie'
    LEFT JOIN user_movie_data umd ON umd.movie_id = m.id AND umd.user_id = ${userId}
    WHERE ${sql.join(where, sql` AND `)}
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    year: r.year,
    communityRating: r.community_rating,
    runtimeMinutes: r.runtime_minutes && r.runtime_minutes > 0 ? r.runtime_minutes : null,
    genres: parseStringArray(r.genres),
    tags: parseStringArray(r.tags),
    posterPath: stampPath(path.join(r.folder_path, r.poster_path), r.poster_mtime),
    posterBlur: r.poster_blur,
    fanartPath: stampPath(r.fanart_path ? path.join(r.folder_path, r.fanart_path) : null, r.fanart_mtime),
    dateAddedMs: parseDbDate(r.date_added),
    isPlayed: !!r.is_played,
    isFavorite: !!r.is_favorite,
    playCount: r.play_count ?? 0,
    personalRating: effectiveRating(r.personal_rating, r.dimension_ratings),
    lastPlayedAt: r.last_played_at,
    lastPlayedMs: parseDbDate(r.last_played_at),
  }));
}

/** Cast (actors only), billing order, for a batch of movie ids. */
function loadCast(movieIds: string[]): Map<string, CastEntry[]> {
  const out = new Map<string, CastEntry[]>();
  for (const ids of chunk(movieIds, 500)) {
    const rows = db.all<{
      movie_id: string;
      person_id: string;
      name: string;
      photo_path: string | null;
      photo_mtime: number | null;
      photo_blur: string | null;
      sort_order: number | null;
    }>(sql`
      SELECT mp.movie_id, mp.person_id, p.name, p.photo_path, p.photo_mtime, p.photo_blur, mp.sort_order
      FROM movie_people mp
      INNER JOIN people p ON p.id = mp.person_id AND p.type = 'actor'
      WHERE mp.movie_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      ORDER BY mp.movie_id, COALESCE(mp.sort_order, 999999), mp.id
    `);
    const hasOrder = new Set<string>();
    for (const r of rows) {
      if (r.sort_order != null) hasOrder.add(r.movie_id);
      let list = out.get(r.movie_id);
      if (!list) out.set(r.movie_id, (list = []));
      if (list.some((e) => e.personId === r.person_id)) continue; // same actor, two roles
      list.push({
        personId: r.person_id,
        name: r.name,
        photoPath: stampPath(r.photo_path ? resolveDataPath(r.photo_path) : null, r.photo_mtime),
        photoBlur: r.photo_blur,
        // Rows are billing-ordered with NULLs last, so the list index is the billing rank.
        main: list.length < MAIN_CAST && r.sort_order != null,
      });
    }
    // A movie with no sortOrder data at all: we can't tell who's main → everyone counts.
    for (const id of ids) {
      if (!hasOrder.has(id)) for (const e of out.get(id) ?? []) e.main = true;
    }
  }
  return out;
}

/** Library-wide taste profile for one user (cinema only). */
function loadSignals(userId: string): Signals {
  const libRows = db.all<{ genres: string | null }>(sql`
    SELECT m.genres FROM movies m
    INNER JOIN media_libraries ml ON ml.id = m.media_library_id AND ml.type = 'movie'
  `);
  const libGenre = new Map<string, number>();
  for (const r of libRows) {
    for (const g of parseStringArray(r.genres)) libGenre.set(g.toLowerCase(), (libGenre.get(g.toLowerCase()) ?? 0) + 1);
  }

  const umdRows = db.all<{
    is_played: number | null;
    is_favorite: number | null;
    play_count: number | null;
    personal_rating: number | null;
    dimension_ratings: string | null;
    genres: string | null;
    tags: string | null;
  }>(sql`
    SELECT umd.is_played, umd.is_favorite, umd.play_count, umd.personal_rating, umd.dimension_ratings,
      m.genres, m.tags
    FROM user_movie_data umd
    INNER JOIN movies m ON m.id = umd.movie_id
    INNER JOIN media_libraries ml ON ml.id = m.media_library_id AND ml.type = 'movie'
    WHERE umd.user_id = ${userId}
  `);

  const rated = umdRows
    .map((r) => effectiveRating(r.personal_rating, r.dimension_ratings))
    .filter((v): v is number => v != null);
  const userMean = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
  const highMovie = highThreshold(rated);

  // Per-genre: rating sum/count + engagement (played / favorited / rated).
  const acc = new Map<string, { name: string; sum: number; n: number; engaged: number }>();
  const tagCount = new Map<string, number>();
  let totalEngaged = 0;
  for (const r of umdRows) {
    const rating = effectiveRating(r.personal_rating, r.dimension_ratings);
    const engaged = !!r.is_played || (r.play_count ?? 0) > 0 || !!r.is_favorite || rating != null;
    if (!engaged) continue;
    totalEngaged++;
    for (const g of parseStringArray(r.genres)) {
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
    if (loved) for (const t of parseStringArray(r.tags)) tagCount.set(t.toLowerCase(), (tagCount.get(t.toLowerCase()) ?? 0) + 1);
  }

  const genres = new Map<string, GenreStat>();
  const totalLib = libRows.length || 1;
  for (const [k, a] of acc) {
    // Rating term: shrunk (k=2 toward the user's mean) avg vs. the user's mean.
    const shrunk = a.n ? (a.sum + userMean * 2) / (a.n + 2) : userMean;
    const ratingTerm = a.n ? clamp((shrunk - userMean) / 1.5, -1, 1) : 0;
    // Engagement term: lift of the genre's share of what you engaged with over
    // its share of the library (so "Drama is everywhere" doesn't count),
    // damped for tiny samples.
    const lift = totalEngaged ? (a.engaged / totalEngaged) / ((libGenre.get(k) ?? 1) / totalLib) : 0;
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
  const lowerTags = c.tags.map((t) => t.toLowerCase());
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
    primaryGenre: c.genres[0]?.toLowerCase() ?? null,
    leads: cast.slice(0, LEAD_CAST).map((e) => e.personId),
  };
}

interface ActorAgg {
  personId: string;
  name: string;
  photoPath: string;
  photoBlur: string | null;
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
function buildActors(scored: ScoredMovie[], castMap: Map<string, CastEntry[]>, sig: Signals, f: RecommendFilters): ActorAgg[] {
  const byId = new Map<string, ActorAgg>();
  for (const m of scored) {
    const cast = castMap.get(m.c.id) ?? [];
    cast.forEach((e, i) => {
      if (!e.photoPath) return;
      if (!e.main && !sig.people.has(e.personId)) return;
      let a = byId.get(e.personId);
      if (!a) {
        a = {
          personId: e.personId,
          name: e.name,
          photoPath: e.photoPath,
          photoBlur: e.photoBlur,
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

function buildContext(userId: string, filters: RecommendFilters, withActors: boolean, extraCastIds: string[] = []): Context {
  const now = Date.now();
  const candidates = loadCandidates(userId, filters);
  const ids = candidates.map((c) => c.id);
  const castMap = loadCast(Array.from(new Set([...ids, ...extraCastIds])));
  const sig = loadSignals(userId);
  const scored = candidates.map((c) => scoreMovie(c, castMap.get(c.id) ?? [], sig, filters, now));
  const actors = withActors ? buildActors(scored, castMap, sig, filters) : [];
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
  const ctx = buildContext(userId, filters, (filters.mix ?? "mixed") !== "movies");
  const M = ctx.scored.length;
  const A = ctx.actors.length;
  const mix = filters.mix ?? "mixed";

  let actorSlots = 0;
  if (mix === "actors") actorSlots = Math.min(A, POOL_CAP);
  else if (mix === "mixed") actorSlots = Math.min(A, Math.max(6, Math.round(Math.min(POOL_CAP, M + A) * 0.2)));
  const movieSlots = Math.min(M, POOL_CAP - actorSlots);

  const movieItems: PoolItem[] = shuffle([...ctx.scored], rng)
    .slice(0, movieSlots)
    .map((m) => ({ type: "movie", id: m.c.id, title: m.c.title, image: m.c.posterPath, blur: m.c.posterBlur }));
  const actorItems: PoolItem[] = shuffle([...ctx.actors], rng)
    .slice(0, actorSlots)
    .map((a) => ({ type: "person", id: a.personId, title: a.name, image: a.photoPath, blur: a.photoBlur }));

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

/** Re-admission order: shown-only before dismissed, then oldest first. */
function readmitOrder(h: HistoryState, key: string): [number, string] {
  const b = h.blocked.get(key)!;
  return [b.dismissed ? 1 : 0, b.at];
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
    genres: c.genres,
    posterPath: c.posterPath,
    posterBlur: c.posterBlur,
    fanartPath: c.fanartPath,
    isPlayed: c.isPlayed,
    isFavorite: c.isFavorite,
    reasons: m.reasons,
  };
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
  const ctx = buildContext(userId, filters, req.actors > 0, excludedMovieIds);
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
  const blockedOrder = blockedMovies.sort((a, b) => {
    const [da, ta] = readmitOrder(history, refKey("movie", a.c.id));
    const [db_, tb] = readmitOrder(history, refKey("movie", b.c.id));
    return da - db_ || ta.localeCompare(tb);
  });
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
    const blockedOrderA = blockedA.sort((a, b) => {
      const [da, ta] = readmitOrder(history, refKey("person", a.personId));
      const [db_, tb] = readmitOrder(history, refKey("person", b.personId));
      return da - db_ || ta.localeCompare(tb);
    });
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
        const topFanart = films.find((x) => x.m.c.fanartPath)?.m.c.fanartPath ?? a.films.find((x) => x.m.c.fanartPath)?.m.c.fanartPath ?? null;
        actorCards.push({
          type: "person",
          id: a.personId,
          name: a.name,
          photoPath: a.photoPath,
          photoBlur: a.photoBlur,
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

  if (opts.record !== false) writeShown(userId, cards);
  return { cards, repeatsAllowed: repeats };
}

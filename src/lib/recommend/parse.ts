import type {
  DrawRequest,
  HistoryRequest,
  RecommendFilters,
  RecommendItemRef,
  RecommendMix,
  RecommendPreset,
} from "./types";

// Input validation for the recommend routes. Pure (no DB) so it's testable in
// isolation. Everything is lenient: unknown/invalid values are dropped rather
// than rejected, so a stale client never gets an empty page over a typo.

const PRESETS: readonly RecommendPreset[] = ["blind", "hiddenGems", "rewatch", "quick", "actorSpotlight"];
const MIXES: readonly RecommendMix[] = ["movies", "mixed", "actors"];
const WATCHED = ["unwatched", "any", "watched"] as const;

/** Max cards of one kind a single draw may ask for. */
export const MAX_DRAW_COUNT = 10;
/** Max genres / tags accepted in one filter (keeps the SQL OR-chain bounded). */
const MAX_LIST = 50;
const MAX_EXCLUDE = 50;

function finiteNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function stringList(v: unknown): string[] | undefined {
  let raw: unknown[];
  if (typeof v === "string") raw = v.split(",");
  else if (Array.isArray(v)) raw = v;
  else return undefined;
  const list = Array.from(
    new Set(
      raw
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 200)
    )
  ).slice(0, MAX_LIST);
  return list.length > 0 ? list : undefined;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

export function clampCount(v: unknown): number {
  const n = finiteNumber(v);
  if (n === undefined) return 0;
  return Math.max(0, Math.min(MAX_DRAW_COUNT, Math.floor(n)));
}

/** Normalizes a filters object from any source (JSON body or query params). */
export function sanitizeFilters(raw: unknown): RecommendFilters {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: RecommendFilters = {};

  const genres = stringList(src.genres);
  if (genres) out.genres = genres;
  const tags = stringList(src.tags);
  if (tags) out.tags = tags;

  const minRating = finiteNumber(src.minRating);
  if (minRating !== undefined && minRating > 0) out.minRating = Math.min(10, minRating);

  const yearFrom = finiteNumber(src.yearFrom);
  if (yearFrom !== undefined) out.yearFrom = Math.round(yearFrom);
  const yearTo = finiteNumber(src.yearTo);
  if (yearTo !== undefined) out.yearTo = Math.round(yearTo);
  if (out.yearFrom !== undefined && out.yearTo !== undefined && out.yearFrom > out.yearTo) {
    [out.yearFrom, out.yearTo] = [out.yearTo, out.yearFrom];
  }

  const maxRuntime = finiteNumber(src.maxRuntime);
  if (maxRuntime !== undefined && maxRuntime > 0) out.maxRuntime = Math.round(maxRuntime);

  out.watched = oneOf(src.watched, WATCHED) ?? "unwatched";

  if (typeof src.libraryId === "string" && src.libraryId.trim()) out.libraryId = src.libraryId.trim();

  const preset = oneOf(src.preset, PRESETS);
  if (preset) out.preset = preset;

  out.mix = oneOf(src.mix, MIXES) ?? "mixed";
  return out;
}

/** GET /api/movies/recommend/pool query params → filters. */
export function parseFiltersFromSearchParams(sp: URLSearchParams): RecommendFilters {
  const obj: Record<string, unknown> = {};
  for (const key of ["genres", "tags", "minRating", "yearFrom", "yearTo", "maxRuntime", "watched", "libraryId", "preset", "mix"]) {
    const v = sp.get(key);
    if (v !== null) obj[key] = v;
  }
  return sanitizeFilters(obj);
}

function parseRef(v: unknown): RecommendItemRef | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const type = oneOf(r.type, ["movie", "person"] as const);
  if (!type || typeof r.id !== "string" || !r.id || r.id.length > 200) return null;
  return { type, id: r.id };
}

/** POST /api/movies/recommend/draw body. Returns null on a non-object body. */
export function parseDrawRequest(body: unknown): DrawRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const exclude = Array.isArray(b.exclude)
    ? b.exclude.map(parseRef).filter((r): r is RecommendItemRef => r !== null).slice(0, MAX_EXCLUDE)
    : [];
  return {
    filters: sanitizeFilters(b.filters),
    movies: clampCount(b.movies),
    actors: clampCount(b.actors),
    exclude,
  };
}

/** POST /api/movies/recommend/history body. Returns null when invalid. */
export function parseHistoryRequest(body: unknown): HistoryRequest | null {
  const ref = parseRef(body);
  if (!ref) return null;
  if ((body as Record<string, unknown>).action !== "dismissed") return null;
  return { ...ref, action: "dismissed" };
}

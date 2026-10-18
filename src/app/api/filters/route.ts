import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readDataVersion } from "@/lib/db/data-versions";
import { movies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Count each string of a JSON-array column into `counts` (once per movie). */
function countJsonArray(raw: string | null, counts: Map<string, number>) {
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const v of new Set<string>(parsed)) counts.set(v, (counts.get(v) ?? 0) + 1);
  } catch {
    // skip malformed JSON
  }
}

/** Same ordering as `a.localeCompare(b)`, without re-resolving the locale per call. */
const collator = new Intl.Collator();

// The response depends only on `movies`, so the serialized body is cached per
// libraryId and keyed by the 'cinema_library' data version (bumped by triggers
// on any movies write). A 5k-movie library with ~10k TMDB keywords costs
// ~35 ms to recompute; a cache hit is a single-row read.
const CACHE_KEY = "__kubby_filters_cache_v1__";
type FiltersCache = { version: number; bodies: Map<string, string> };

function computeBody(libraryId: string | null): string {
  const query = db
    .select({
      genres: movies.genres,
      tags: movies.tags,
      year: movies.year,
    })
    .from(movies);

  const rows = libraryId
    ? query.where(eq(movies.mediaLibraryId, libraryId)).all()
    : query.all();

  // Collect unique genres / tags with per-movie counts
  const genreCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const row of rows) {
    countJsonArray(row.genres, genreCounts);
    countJsonArray(row.tags, tagCounts);
  }

  // Collect unique years
  const yearSet = new Set<number>();
  for (const row of rows) {
    if (row.year != null) yearSet.add(row.year);
  }

  return JSON.stringify({
    genres: Array.from(genreCounts.keys()).sort(collator.compare),
    tags: Array.from(tagCounts.keys()).sort(collator.compare),
    years: Array.from(yearSet).sort((a, b) => b - a),
    genreCounts: Object.fromEntries(genreCounts),
    tagCounts: Object.fromEntries(tagCounts),
  });
}

// GET /api/filters?libraryId=xxx (libraryId optional)
// → { genres, tags, years, genreCounts, tagCounts } — counts = movies carrying each
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");

    const version = readDataVersion("cinema_library"); // null (unmigrated DB) → no cache
    const g = globalThis as Record<string, unknown>;
    let cache = g[CACHE_KEY] as FiltersCache | undefined;
    if (version == null || cache?.version !== version) {
      cache = { version: version ?? -1, bodies: new Map() };
      if (version != null) g[CACHE_KEY] = cache;
    }
    const key = libraryId ?? "";
    let body = cache.bodies.get(key);
    if (body === undefined) {
      body = computeBody(libraryId);
      if (version != null) {
        if (cache.bodies.size >= 32) cache.bodies.clear(); // libraryId is client input — stay bounded
        cache.bodies.set(key, body);
      }
    }

    return new NextResponse(body, { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Filters error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

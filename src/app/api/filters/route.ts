import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
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

// GET /api/filters?libraryId=xxx (libraryId optional)
// → { genres, tags, years, genreCounts, tagCounts } — counts = movies carrying each
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");

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

    return NextResponse.json({
      genres: Array.from(genreCounts.keys()).sort((a, b) => a.localeCompare(b)),
      tags: Array.from(tagCounts.keys()).sort((a, b) => a.localeCompare(b)),
      years: Array.from(yearSet).sort((a, b) => b - a),
      genreCounts: Object.fromEntries(genreCounts),
      tagCounts: Object.fromEntries(tagCounts),
    });
  } catch (error) {
    console.error("Filters error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

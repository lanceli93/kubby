import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/libraries/[id]/filters
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const rows = db
      .select({
        genres: movies.genres,
        year: movies.year,
      })
      .from(movies)
      .where(eq(movies.mediaLibraryId, id))
      .all();

    // Collect unique genres
    const genreSet = new Set<string>();
    for (const row of rows) {
      if (row.genres) {
        try {
          const parsed = JSON.parse(row.genres);
          if (Array.isArray(parsed)) {
            for (const g of parsed) genreSet.add(g);
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    // Collect unique years
    const yearSet = new Set<number>();
    for (const row of rows) {
      if (row.year != null) yearSet.add(row.year);
    }

    return NextResponse.json({
      genres: Array.from(genreSet).sort((a, b) => a.localeCompare(b)),
      years: Array.from(yearSet).sort((a, b) => b - a),
    });
  } catch (error) {
    console.error("Filters error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

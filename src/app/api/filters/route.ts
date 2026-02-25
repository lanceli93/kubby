import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/filters?libraryId=xxx (libraryId optional)
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

    // Collect unique tags
    const tagSet = new Set<string>();
    for (const row of rows) {
      if (row.tags) {
        try {
          const parsed = JSON.parse(row.tags);
          if (Array.isArray(parsed)) {
            for (const t of parsed) tagSet.add(t);
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
      tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
      years: Array.from(yearSet).sort((a, b) => b - a),
    });
  } catch (error) {
    console.error("Filters error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/movies/genres?libraryId=X
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");

    let query = db
      .select({ genres: movies.genres })
      .from(movies)
      .$dynamic();

    if (libraryId) {
      query = query.where(eq(movies.mediaLibraryId, libraryId));
    }

    const results = query.all();

    // Parse JSON genre arrays, de-duplicate, sort
    const genreSet = new Set<string>();
    for (const row of results) {
      if (row.genres) {
        try {
          const parsed = JSON.parse(row.genres);
          if (Array.isArray(parsed)) {
            for (const g of parsed) {
              if (typeof g === "string" && g.trim()) {
                genreSet.add(g.trim());
              }
            }
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    const sorted = Array.from(genreSet).sort((a, b) => a.localeCompare(b));
    return NextResponse.json(sorted);
  } catch (error) {
    console.error("List genres error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

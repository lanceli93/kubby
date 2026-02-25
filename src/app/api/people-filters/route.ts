import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

// GET /api/people-filters?libraryId=xxx (libraryId optional)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");

    const libraryCondition = libraryId
      ? sql`WHERE m.media_library_id = ${libraryId}`
      : sql``;

    const rows = db.all<{
      type: string;
      tags: string | null;
    }>(sql`
      SELECT DISTINCT p.type, p.tags
      FROM people p
      INNER JOIN movie_people mp ON mp.person_id = p.id
      INNER JOIN movies m ON m.id = mp.movie_id
      ${libraryCondition}
    `);

    // Collect unique types
    const typeSet = new Set<string>();
    const tagSet = new Set<string>();

    for (const row of rows) {
      typeSet.add(row.type);
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

    return NextResponse.json({
      types: Array.from(typeSet).sort(),
      tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
    });
  } catch (error) {
    console.error("People filters error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

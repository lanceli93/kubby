import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies } from "@/lib/db/schema";
import { eq, desc, asc, like, sql } from "drizzle-orm";

// GET /api/movies
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "dateAdded";
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const exclude = searchParams.get("exclude");

    let query = db.select().from(movies).$dynamic();

    // Filters
    const conditions = [];
    if (libraryId) {
      conditions.push(eq(movies.mediaLibraryId, libraryId));
    }
    if (search) {
      conditions.push(like(movies.title, `%${search}%`));
    }
    if (exclude) {
      conditions.push(sql`${movies.id} != ${exclude}`);
    }

    if (conditions.length > 0) {
      for (const cond of conditions) {
        query = query.where(cond);
      }
    }

    // Sort
    switch (sort) {
      case "title":
        query = query.orderBy(asc(movies.title));
        break;
      case "releaseDate":
        query = query.orderBy(desc(movies.year));
        break;
      case "rating":
        query = query.orderBy(desc(movies.communityRating));
        break;
      case "runtime":
        query = query.orderBy(desc(movies.runtimeMinutes));
        break;
      case "dateAdded":
      default:
        query = query.orderBy(desc(movies.dateAdded));
        break;
    }

    const results = query.limit(limit).all();

    return NextResponse.json(results);
  } catch (error) {
    console.error("List movies error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

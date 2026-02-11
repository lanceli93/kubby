import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import { db } from "@/lib/db";
import { people, moviePeople, movies } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET /api/people/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const person = db.select().from(people).where(eq(people.id, id)).get();

    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get filmography
    const filmography = db
      .select({
        id: movies.id,
        title: movies.title,
        year: movies.year,
        posterPath: movies.posterPath,
        fanartPath: movies.fanartPath,
        folderPath: movies.folderPath,
        communityRating: movies.communityRating,
        role: moviePeople.role,
      })
      .from(moviePeople)
      .innerJoin(movies, eq(moviePeople.movieId, movies.id))
      .where(eq(moviePeople.personId, id))
      .orderBy(desc(movies.year))
      .all();

    // Resolve paths and find fanart for person backdrop
    const resolvedFilms = filmography.map((m) => ({
      ...m,
      posterPath: m.posterPath ? nodePath.join(m.folderPath, m.posterPath) : null,
      fanartPath: m.fanartPath ? nodePath.join(m.folderPath, m.fanartPath) : null,
    }));

    const fanartPath = resolvedFilms.find((m) => m.fanartPath)?.fanartPath || null;

    return NextResponse.json({
      ...person,
      fanartPath,
      movies: resolvedFilms,
    });
  } catch (error) {
    console.error("Get person error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

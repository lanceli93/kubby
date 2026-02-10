import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies, moviePeople, people } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

// GET /api/movies/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const movie = db.select().from(movies).where(eq(movies.id, id)).get();

    if (!movie) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Get cast (actors)
    const cast = db
      .select({
        id: people.id,
        name: people.name,
        role: moviePeople.role,
        photoPath: people.photoPath,
        sortOrder: moviePeople.sortOrder,
      })
      .from(moviePeople)
      .innerJoin(people, eq(moviePeople.personId, people.id))
      .where(
        and(
          eq(moviePeople.movieId, id),
          eq(people.type, "actor")
        )
      )
      .orderBy(asc(moviePeople.sortOrder))
      .all();

    // Get directors
    const directors = db
      .select({
        id: people.id,
        name: people.name,
      })
      .from(moviePeople)
      .innerJoin(people, eq(moviePeople.personId, people.id))
      .where(
        and(
          eq(moviePeople.movieId, id),
          eq(people.type, "director")
        )
      )
      .all();

    return NextResponse.json({
      ...movie,
      genres: movie.genres ? JSON.parse(movie.genres) : [],
      studios: movie.studios ? JSON.parse(movie.studios) : [],
      cast,
      directors,
    });
  } catch (error) {
    console.error("Get movie error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

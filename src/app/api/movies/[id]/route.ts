import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import { db } from "@/lib/db";
import { movies, moviePeople, people, userMovieData } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";

// DELETE /api/movies/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const movie = db.select().from(movies).where(eq(movies.id, id)).get();
    if (!movie) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    db.delete(movies).where(eq(movies.id, id)).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete movie error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
        and(eq(moviePeople.movieId, id), eq(people.type, "actor"))
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
        and(eq(moviePeople.movieId, id), eq(people.type, "director"))
      )
      .all();

    // Get user data if authenticated
    let userData = null;
    const session = await auth();
    if (session?.user?.id) {
      userData = db
        .select()
        .from(userMovieData)
        .where(
          and(
            eq(userMovieData.userId, session.user.id),
            eq(userMovieData.movieId, id)
          )
        )
        .get() || null;
    }

    // Resolve relative paths to absolute
    const posterPath = movie.posterPath
      ? nodePath.join(movie.folderPath, movie.posterPath)
      : null;
    const fanartPath = movie.fanartPath
      ? nodePath.join(movie.folderPath, movie.fanartPath)
      : null;

    return NextResponse.json({
      ...movie,
      posterPath,
      fanartPath,
      genres: movie.genres ? JSON.parse(movie.genres) : [],
      studios: movie.studios ? JSON.parse(movie.studios) : [],
      cast,
      directors,
      userData: userData
        ? {
            isPlayed: userData.isPlayed,
            isFavorite: userData.isFavorite,
            playbackPositionSeconds: userData.playbackPositionSeconds,
            playCount: userData.playCount,
          }
        : null,
    });
  } catch (error) {
    console.error("Get movie error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

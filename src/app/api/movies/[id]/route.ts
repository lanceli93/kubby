import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import { db } from "@/lib/db";
import { movies, moviePeople, people, userMovieData } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { writeFullNfo, type NfoMovieData } from "@/lib/scanner/nfo-writer";

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

// PUT /api/movies/[id]
export async function PUT(
  request: NextRequest,
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

    const body = await request.json();

    // Build update object from allowed fields
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.originalTitle !== undefined) updateData.originalTitle = body.originalTitle;
    if (body.sortName !== undefined) updateData.sortName = body.sortName;
    if (body.overview !== undefined) updateData.overview = body.overview;
    if (body.tagline !== undefined) updateData.tagline = body.tagline;
    if (body.year !== undefined) updateData.year = body.year ? Number(body.year) : null;
    if (body.premiereDate !== undefined) updateData.premiereDate = body.premiereDate;
    if (body.runtimeMinutes !== undefined) updateData.runtimeMinutes = body.runtimeMinutes ? Number(body.runtimeMinutes) : null;
    if (body.communityRating !== undefined) updateData.communityRating = body.communityRating ? Number(body.communityRating) : null;
    if (body.officialRating !== undefined) updateData.officialRating = body.officialRating;
    if (body.country !== undefined) updateData.country = body.country;
    if (body.tmdbId !== undefined) updateData.tmdbId = body.tmdbId;
    if (body.imdbId !== undefined) updateData.imdbId = body.imdbId;
    if (body.genres !== undefined) updateData.genres = JSON.stringify(body.genres);
    if (body.studios !== undefined) updateData.studios = JSON.stringify(body.studios);

    db.update(movies).set(updateData).where(eq(movies.id, id)).run();

    // Re-read updated movie
    const updated = db.select().from(movies).where(eq(movies.id, id)).get()!;

    // Get cast + directors for NFO regeneration
    const cast = db
      .select({
        name: people.name,
        role: moviePeople.role,
        photoPath: people.photoPath,
        sortOrder: moviePeople.sortOrder,
      })
      .from(moviePeople)
      .innerJoin(people, eq(moviePeople.personId, people.id))
      .where(and(eq(moviePeople.movieId, id), eq(people.type, "actor")))
      .orderBy(asc(moviePeople.sortOrder))
      .all();

    const directors = db
      .select({ name: people.name })
      .from(moviePeople)
      .innerJoin(people, eq(moviePeople.personId, people.id))
      .where(and(eq(moviePeople.movieId, id), eq(people.type, "director")))
      .all();

    // Regenerate NFO file
    if (updated.nfoPath) {
      const nfoFullPath = nodePath.join(updated.folderPath, updated.nfoPath);
      const nfoData: NfoMovieData = {
        title: updated.title,
        originalTitle: updated.originalTitle || undefined,
        sortTitle: updated.sortName || undefined,
        overview: updated.overview || undefined,
        tagline: updated.tagline || undefined,
        rating: updated.communityRating || undefined,
        mpaa: updated.officialRating || undefined,
        runtime: updated.runtimeMinutes || undefined,
        premiered: updated.premiereDate || undefined,
        year: updated.year || undefined,
        genres: updated.genres ? JSON.parse(updated.genres) : undefined,
        studios: updated.studios ? JSON.parse(updated.studios) : undefined,
        country: updated.country || undefined,
        tmdbId: updated.tmdbId || undefined,
        imdbId: updated.imdbId || undefined,
        actors: cast.map((c) => ({
          name: c.name,
          role: c.role || "",
          thumb: c.photoPath || undefined,
          order: c.sortOrder || 0,
        })),
        directors: directors.map((d) => d.name),
      };
      writeFullNfo(nfoFullPath, nfoData);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update movie error:", error);
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

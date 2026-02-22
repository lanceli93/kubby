import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import { db } from "@/lib/db";
import { movies, moviePeople, people, userMovieData, userPersonData, mediaStreams, movieDiscs } from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { writeFullNfo, type NfoMovieData } from "@/lib/scanner/nfo-writer";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

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
    if (body.videoCodec !== undefined) updateData.videoCodec = body.videoCodec;
    if (body.audioCodec !== undefined) updateData.audioCodec = body.audioCodec;
    if (body.videoWidth !== undefined) updateData.videoWidth = body.videoWidth ? Number(body.videoWidth) : null;
    if (body.videoHeight !== undefined) updateData.videoHeight = body.videoHeight ? Number(body.videoHeight) : null;
    if (body.audioChannels !== undefined) updateData.audioChannels = body.audioChannels ? Number(body.audioChannels) : null;
    if (body.container !== undefined) updateData.container = body.container;
    if (body.tags !== undefined) updateData.tags = JSON.stringify(body.tags);

    db.update(movies).set(updateData).where(eq(movies.id, id)).run();

    // Handle cast updates
    if (body.cast !== undefined && Array.isArray(body.cast)) {
      // Delete all existing moviePeople rows for this movie
      db.delete(moviePeople).where(eq(moviePeople.movieId, id)).run();

      for (let i = 0; i < body.cast.length; i++) {
        const entry = body.cast[i];
        const name = (entry.name || "").trim();
        const type = entry.type || "actor";
        const role = entry.role || "";
        if (!name) continue;

        // Find existing person by name + type, or create new
        let person = db
          .select()
          .from(people)
          .where(and(eq(people.name, name), eq(people.type, type)))
          .get();

        if (!person) {
          const personId = crypto.randomUUID();
          db.insert(people)
            .values({ id: personId, name, type })
            .run();
          person = db.select().from(people).where(eq(people.id, personId)).get()!;
        }

        db.insert(moviePeople)
          .values({
            id: crypto.randomUUID(),
            movieId: id,
            personId: person.id,
            role,
            sortOrder: i,
          })
          .run();
      }
    }

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

      // Fetch media streams for rich NFO fileinfo
      const streams = db
        .select()
        .from(mediaStreams)
        .where(eq(mediaStreams.movieId, id))
        .orderBy(asc(mediaStreams.streamIndex))
        .all();

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
        videoCodec: updated.videoCodec || undefined,
        audioCodec: updated.audioCodec || undefined,
        videoWidth: updated.videoWidth || undefined,
        videoHeight: updated.videoHeight || undefined,
        audioChannels: updated.audioChannels || undefined,
        durationInSeconds: updated.runtimeSeconds || undefined,
        tags: updated.tags ? JSON.parse(updated.tags) : undefined,
        streamDetails: streams.length > 0 ? streams.map((s) => ({
          streamType: s.streamType as "video" | "audio" | "subtitle",
          codec: s.codec || undefined,
          width: s.width || undefined,
          height: s.height || undefined,
          bitrate: s.bitrate || undefined,
          bitDepth: s.bitDepth || undefined,
          frameRate: s.frameRate || undefined,
          channels: s.channels || undefined,
          channelLayout: s.channelLayout || undefined,
          language: s.language || undefined,
          sampleRate: s.sampleRate || undefined,
        })) : undefined,
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

    // Get user session early (needed for user-specific data)
    const session = await auth();
    const userId = session?.user?.id;

    // Get cast (actors) with personal rating and birthDate
    const cast = db
      .select({
        id: people.id,
        name: people.name,
        role: moviePeople.role,
        photoPath: people.photoPath,
        photoMtime: people.photoMtime,
        photoBlur: people.photoBlur,
        sortOrder: moviePeople.sortOrder,
        personalRating: userPersonData.personalRating,
        birthDate: people.birthDate,
        birthYear: people.birthYear,
      })
      .from(moviePeople)
      .innerJoin(people, eq(moviePeople.personId, people.id))
      .leftJoin(
        userPersonData,
        and(
          eq(userPersonData.personId, people.id),
          userId ? eq(userPersonData.userId, userId) : sql`0`
        )
      )
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

    // Get all people (for metadata editor cast tab)
    const allPeople = db
      .select({
        id: people.id,
        name: people.name,
        type: people.type,
        role: moviePeople.role,
        sortOrder: moviePeople.sortOrder,
      })
      .from(moviePeople)
      .innerJoin(people, eq(moviePeople.personId, people.id))
      .where(eq(moviePeople.movieId, id))
      .orderBy(asc(moviePeople.sortOrder))
      .all();

    // Get user movie data if authenticated
    let userData = null;
    if (userId) {
      userData = db
        .select()
        .from(userMovieData)
        .where(
          and(
            eq(userMovieData.userId, userId),
            eq(userMovieData.movieId, id)
          )
        )
        .get() || null;
    }

    // Get disc info for multi-disc movies
    const discs = movie.discCount && movie.discCount > 1
      ? db
          .select()
          .from(movieDiscs)
          .where(eq(movieDiscs.movieId, id))
          .orderBy(asc(movieDiscs.discNumber))
          .all()
      : [];

    // Resolve relative paths to absolute
    const posterPath = movie.posterPath
      ? nodePath.join(movie.folderPath, movie.posterPath)
      : null;
    const fanartPath = movie.fanartPath
      ? nodePath.join(movie.folderPath, movie.fanartPath)
      : null;

    return NextResponse.json({
      ...movie,
      posterPath: stampPath(posterPath, movie.posterMtime),
      posterBlur: movie.posterBlur,
      fanartPath: stampPath(fanartPath, movie.fanartMtime),
      genres: movie.genres ? JSON.parse(movie.genres) : [],
      studios: movie.studios ? JSON.parse(movie.studios) : [],
      tags: movie.tags ? JSON.parse(movie.tags) : [],
      cast: cast.map((c) => ({ ...c, photoPath: stampPath(c.photoPath, c.photoMtime), photoBlur: c.photoBlur })),
      directors,
      allPeople,
      discs: discs.map((d) => ({
        ...d,
        posterPath: stampPath(
          d.posterPath
            ? nodePath.join(movie.folderPath, d.posterPath)
            : posterPath, // fall back to movie poster
          movie.posterMtime
        ),
      })),
      userData: userData
        ? {
            isPlayed: userData.isPlayed,
            isFavorite: userData.isFavorite,
            playbackPositionSeconds: userData.playbackPositionSeconds,
            currentDisc: userData.currentDisc ?? 1,
            playCount: userData.playCount,
            personalRating: userData.personalRating,
            dimensionRatings: userData.dimensionRatings ? JSON.parse(userData.dimensionRatings) : null,
          }
        : null,
    });
  } catch (error) {
    console.error("Get movie error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

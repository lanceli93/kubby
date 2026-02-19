import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import { db } from "@/lib/db";
import { people, moviePeople, movies, userPersonData } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// PUT /api/people/[id]
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
    const person = db.select().from(people).where(eq(people.id, id)).get();
    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.tmdbId !== undefined) updateData.tmdbId = body.tmdbId;
    if (body.imdbId !== undefined) updateData.imdbId = body.imdbId;
    if (body.overview !== undefined) updateData.overview = body.overview;
    if (body.birthDate !== undefined) updateData.birthDate = body.birthDate;
    if (body.birthYear !== undefined) updateData.birthYear = body.birthYear ? Number(body.birthYear) : null;
    if (body.placeOfBirth !== undefined) updateData.placeOfBirth = body.placeOfBirth;
    if (body.deathDate !== undefined) updateData.deathDate = body.deathDate;

    db.update(people).set(updateData).where(eq(people.id, id)).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update person error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
        videoWidth: movies.videoWidth,
        videoHeight: movies.videoHeight,
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

    // Get user data if authenticated
    let userData = null;
    const session = await auth();
    if (session?.user?.id) {
      userData = db
        .select()
        .from(userPersonData)
        .where(
          and(
            eq(userPersonData.userId, session.user.id),
            eq(userPersonData.personId, id)
          )
        )
        .get() || null;
    }

    return NextResponse.json({
      ...person,
      fanartPath,
      movies: resolvedFilms,
      userData: userData
        ? {
            personalRating: userData.personalRating,
            dimensionRatings: userData.dimensionRatings ? JSON.parse(userData.dimensionRatings) : null,
          }
        : null,
    });
  } catch (error) {
    console.error("Get person error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

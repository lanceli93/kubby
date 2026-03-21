import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { db } from "@/lib/db";
import { people, moviePeople, movies, userPersonData } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { computeAgeAtRelease } from "@/lib/scanner";
import { auth } from "@/lib/auth";
import { getPersonDir } from "@/lib/person-utils";
import { resolveDataPath, toRelativeDataPath } from "@/lib/paths";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

/** Fallback: read mtime from filesystem for paths without stored mtime (e.g. person fanart). */
const stampPathFs = (p: string | null) => {
  if (!p) return null;
  try { return `${p}|${fs.statSync(p).mtimeMs}`; } catch { return p; }
};

// DELETE /api/people/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleteFiles = request.nextUrl.searchParams.get("deleteFiles") === "true";

  try {
    const person = db.select().from(people).where(eq(people.id, id)).get();
    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // CASCADE auto-deletes movie_people and user_person_data rows
    db.delete(people).where(eq(people.id, id)).run();

    if (deleteFiles) {
      const personDir = getPersonDir(person);
      try {
        await fsPromises.rm(personDir, { recursive: true, force: true });
      } catch (fsError) {
        console.error("Failed to delete person folder:", personDir, fsError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete person error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
    if (body.tags !== undefined) updateData.tags = body.tags ? JSON.stringify(body.tags) : null;

    db.update(people).set(updateData).where(eq(people.id, id)).run();

    // Recalculate ageAtRelease for all linked movies when birth info changes
    if (body.birthDate !== undefined || body.birthYear !== undefined) {
      const updatedPerson = db.select({ birthDate: people.birthDate, birthYear: people.birthYear }).from(people).where(eq(people.id, id)).get();
      const linkedMovies = db
        .select({ mpId: moviePeople.id, premiereDate: movies.premiereDate, year: movies.year })
        .from(moviePeople)
        .innerJoin(movies, eq(moviePeople.movieId, movies.id))
        .where(eq(moviePeople.personId, id))
        .all();
      for (const m of linkedMovies) {
        const age = computeAgeAtRelease(updatedPerson?.birthDate, m.premiereDate, m.year, updatedPerson?.birthYear);
        db.update(moviePeople).set({ ageAtRelease: age }).where(eq(moviePeople.id, m.mpId)).run();
      }
    }

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
        posterMtime: movies.posterMtime,
        posterBlur: movies.posterBlur,
        fanartPath: movies.fanartPath,
        fanartMtime: movies.fanartMtime,
        folderPath: movies.folderPath,
        communityRating: movies.communityRating,
        videoWidth: movies.videoWidth,
        videoHeight: movies.videoHeight,
        role: moviePeople.role,
        ageAtRelease: moviePeople.ageAtRelease,
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

    // Check for person's own fanart first, then fall back to movie fanart
    const personDir = getPersonDir(person);
    let fanartPath: string | null = null;
    let fanartSource: "own" | "movie" | null = null;

    if (person.fanartPath) {
      // DB has own fanart recorded
      fanartPath = resolveDataPath(person.fanartPath);
      fanartSource = "own";
    } else {
      // Backfill: legacy fanart exists on disk but not in DB
      const ownFanartPath = nodePath.join(personDir, "fanart.jpg");
      if (fs.existsSync(ownFanartPath)) {
        fanartPath = ownFanartPath;
        fanartSource = "own";
        db.update(people).set({ fanartPath: toRelativeDataPath(ownFanartPath) }).where(eq(people.id, id)).run();
      } else {
        fanartPath = resolvedFilms.find((m) => m.fanartPath)?.fanartPath || null;
        fanartSource = fanartPath ? "movie" : null;
      }
    }

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

    // Parse tags from JSON string
    const parsedTags = person.tags ? (() => { try { return JSON.parse(person.tags); } catch { return []; } })() : [];

    return NextResponse.json({
      ...person,
      photoPath: stampPath(person.photoPath ? resolveDataPath(person.photoPath) : null, person.photoMtime),
      photoBlur: person.photoBlur,
      tags: parsedTags,
      fanartPath: stampPathFs(fanartPath), // person fanart has no DB mtime — use fs fallback (1 call)
      fanartSource,
      movies: resolvedFilms.map((m) => ({
        ...m,
        posterPath: stampPath(m.posterPath, m.posterMtime),
        posterBlur: m.posterBlur,
        fanartPath: stampPath(m.fanartPath, m.fanartMtime),
      })),
      userData: userData
        ? {
            personalRating: userData.personalRating,
            dimensionRatings: userData.dimensionRatings ? JSON.parse(userData.dimensionRatings) : null,
            isFavorite: userData.isFavorite ?? false,
          }
        : null,
    });
  } catch (error) {
    console.error("Get person error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

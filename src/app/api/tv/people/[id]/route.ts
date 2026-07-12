import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import { db } from "@/lib/db";
import { tvPeople, tvShowPeople, tvShows } from "@/lib/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { resolveDataPath } from "@/lib/paths";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

// GET /api/tv/people/[id]
//
// Isolated TV-domain person detail — queries tv_people / tv_show_people only,
// NEVER the cinema people tables. TV people are read-only (no user-data /
// gallery / metadata-editor tables exist for them), so this returns the bio +
// the shows the person appears in, with no userData block.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const person = db.select().from(tvPeople).where(eq(tvPeople.id, id)).get();
    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Shows this person appears in (the TV equivalent of a filmography).
    const shows = db
      .select({
        id: tvShows.id,
        title: tvShows.title,
        year: tvShows.year,
        posterPath: tvShows.posterPath,
        posterMtime: tvShows.posterMtime,
        posterBlur: tvShows.posterBlur,
        fanartPath: tvShows.fanartPath,
        fanartMtime: tvShows.fanartMtime,
        folderPath: tvShows.folderPath,
        communityRating: tvShows.communityRating,
        role: tvShowPeople.role,
      })
      .from(tvShowPeople)
      .innerJoin(tvShows, eq(tvShowPeople.showId, tvShows.id))
      .where(eq(tvShowPeople.personId, id))
      .orderBy(desc(tvShows.year), asc(tvShows.title))
      .all();

    const resolvedShows = shows.map((s) => ({
      id: s.id,
      title: s.title,
      year: s.year,
      role: s.role,
      communityRating: s.communityRating,
      posterPath: stampPath(
        s.posterPath ? nodePath.join(s.folderPath, s.posterPath) : null,
        s.posterMtime
      ),
      posterBlur: s.posterBlur,
      fanartPath: stampPath(
        s.fanartPath ? nodePath.join(s.folderPath, s.fanartPath) : null,
        s.fanartMtime
      ),
    }));

    // Own fanart if recorded, else fall back to a linked show's fanart.
    const fanartPath = person.fanartPath
      ? stampPath(resolveDataPath(person.fanartPath))
      : resolvedShows.find((s) => s.fanartPath)?.fanartPath ?? null;

    return NextResponse.json({
      ...person,
      photoPath: stampPath(
        person.photoPath ? resolveDataPath(person.photoPath) : null,
        person.photoMtime
      ),
      photoBlur: person.photoBlur,
      fanartPath,
      tags: person.tags ? (() => { try { return JSON.parse(person.tags); } catch { return []; } })() : [],
      shows: resolvedShows,
    });
  } catch (error) {
    console.error("Get tv person error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

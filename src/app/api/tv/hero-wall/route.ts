import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { tvShows } from "@/lib/db/schema";
import { and, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

// GET /api/tv/hero-wall — show pool for the /tv home hero poster mosaic.
//
// The TV domain has no saved HeroMosaicConfig (that's a cinema-only preference),
// so this is the simple case of the movie hero-wall: a single random sample of
// shows that have at least one image, shaped as MosaicMovie for HeroMosaic.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(120, parseInt(searchParams.get("limit") || "60", 10) || 60));

    const rows = db
      .select({
        id: tvShows.id,
        title: tvShows.title,
        folderPath: tvShows.folderPath,
        posterPath: tvShows.posterPath,
        posterMtime: tvShows.posterMtime,
        posterBlur: tvShows.posterBlur,
        fanartPath: tvShows.fanartPath,
        fanartMtime: tvShows.fanartMtime,
      })
      .from(tvShows)
      .where(
        and(
          sql`(${tvShows.posterPath} IS NOT NULL OR ${tvShows.fanartPath} IS NOT NULL)`
        )
      )
      .orderBy(sql`RANDOM()`)
      .limit(limit)
      .all();

    const results = rows.map((r) => ({
      id: r.id,
      title: r.title,
      posterPath: stampPath(r.posterPath ? path.join(r.folderPath, r.posterPath) : null, r.posterMtime),
      posterBlur: r.posterBlur,
      fanartPath: stampPath(r.fanartPath ? path.join(r.folderPath, r.fanartPath) : null, r.fanartMtime),
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Hero wall tv error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

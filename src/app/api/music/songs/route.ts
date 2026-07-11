import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { musicAlbums, musicTracks, userTrackData } from "@/lib/db/schema";
import { and, asc, count, desc, eq, like, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getTrackArtistNames } from "@/lib/music/queries";

// GET /api/music/songs?libraryId=&sort=&sortOrder=&search=&offset=&limit=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "title";
    const sortOrder = searchParams.get("sortOrder") || (sort === "title" ? "asc" : "desc");
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "60", 10) || 60));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    const session = await auth();
    const userId = session?.user?.id;

    const conditions = [];
    if (libraryId) conditions.push(eq(musicTracks.libraryId, libraryId));
    if (search) conditions.push(like(musicTracks.title, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderFn = sortOrder === "asc" ? asc : desc;
    let orderClause;
    switch (sort) {
      case "dateAdded":
        orderClause = orderFn(musicTracks.dateAdded);
        break;
      case "duration":
        orderClause = orderFn(musicTracks.durationSeconds);
        break;
      case "title":
      default:
        orderClause = orderFn(sql`COALESCE(${musicTracks.sortTitle}, ${musicTracks.title})`);
        break;
    }

    const pageRows = db
      .select({
        id: musicTracks.id,
        title: musicTracks.title,
        durationSeconds: musicTracks.durationSeconds,
        albumId: musicTracks.albumId,
        trackNumber: musicTracks.trackNumber,
        albumTitle: musicAlbums.title,
        coverPath: musicAlbums.coverPath,
        coverBlur: musicAlbums.coverBlur,
        isFavorite: userTrackData.isFavorite,
      })
      .from(musicTracks)
      .leftJoin(musicAlbums, eq(musicAlbums.id, musicTracks.albumId))
      .leftJoin(
        userTrackData,
        and(
          eq(userTrackData.trackId, musicTracks.id),
          userId ? eq(userTrackData.userId, userId) : sql`0`
        )
      )
      .where(where)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset)
      .all();

    const trackArtistNames = getTrackArtistNames(pageRows.map((r) => r.id));

    const items = pageRows.map((r) => ({
      id: r.id,
      title: r.title,
      durationSeconds: r.durationSeconds,
      artistName: trackArtistNames.get(r.id) ?? "",
      albumId: r.albumId,
      albumTitle: r.albumTitle,
      coverPath: r.coverPath,
      coverBlur: r.coverBlur,
      trackNumber: r.trackNumber,
      isFavorite: r.isFavorite ?? false,
    }));

    const [{ total: totalCount }] = db
      .select({ total: count() })
      .from(musicTracks)
      .where(where)
      .all();

    return NextResponse.json({
      items,
      totalCount,
      offset,
      limit,
      hasMore: offset + items.length < totalCount,
    });
  } catch (error) {
    console.error("List songs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

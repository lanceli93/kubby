import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { musicAlbums } from "@/lib/db/schema";
import { and, asc, count, desc, eq, like, sql } from "drizzle-orm";
import { getAlbumArtistNames, getAlbumTrackCounts } from "@/lib/music/queries";

// GET /api/music/albums?libraryId=&sort=&sortOrder=&search=&offset=&limit=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "dateAdded";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "60", 10) || 60));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    const conditions = [];
    if (libraryId) conditions.push(eq(musicAlbums.libraryId, libraryId));
    if (search) conditions.push(like(musicAlbums.title, `%${search}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderFn = sortOrder === "asc" ? asc : desc;
    let orderClause;
    switch (sort) {
      case "title":
        orderClause = orderFn(sql`COALESCE(${musicAlbums.sortTitle}, ${musicAlbums.title})`);
        break;
      case "year":
        orderClause = orderFn(musicAlbums.year);
        break;
      case "dateAdded":
      default:
        orderClause = orderFn(musicAlbums.dateAdded);
        break;
    }

    const pageRows = db
      .select({
        id: musicAlbums.id,
        title: musicAlbums.title,
        year: musicAlbums.year,
        coverPath: musicAlbums.coverPath,
        coverBlur: musicAlbums.coverBlur,
      })
      .from(musicAlbums)
      .where(where)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset)
      .all();

    const albumIds = pageRows.map((r) => r.id);
    const artistNames = getAlbumArtistNames(albumIds);
    const trackCounts = getAlbumTrackCounts(albumIds);

    const items = pageRows.map((r) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      coverPath: r.coverPath,
      coverBlur: r.coverBlur,
      artistName: artistNames.get(r.id) ?? "",
      trackCount: trackCounts.get(r.id) ?? 0,
    }));

    const [{ total: totalCount }] = db
      .select({ total: count() })
      .from(musicAlbums)
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
    console.error("List albums error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

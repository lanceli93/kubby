import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  musicAlbumArtists,
  musicAlbums,
  musicArtists,
  musicTrackArtists,
  musicTracks,
} from "@/lib/db/schema";
import { and, asc, count, countDistinct, desc, inArray, like, or, sql } from "drizzle-orm";

// GET /api/music/artists?libraryId=&sort=&sortOrder=&search=&offset=&limit=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "name";
    const sortOrder = searchParams.get("sortOrder") || (sort === "name" ? "asc" : "desc");
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "60", 10) || 60));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);

    // libraryId scope: an artist qualifies if it has at least one album OR one
    // track in that library. Express as a correlated EXISTS subquery so we can
    // keep artist paging on the artists table.
    const conditions = [];
    if (search) conditions.push(like(musicArtists.name, `%${search}%`));
    if (libraryId) {
      conditions.push(
        or(
          sql`EXISTS (SELECT 1 FROM ${musicAlbumArtists}
                      JOIN ${musicAlbums} ON ${musicAlbums.id} = ${musicAlbumArtists.albumId}
                      WHERE ${musicAlbumArtists.artistId} = ${musicArtists.id}
                        AND ${musicAlbums.libraryId} = ${libraryId})`,
          sql`EXISTS (SELECT 1 FROM ${musicTrackArtists}
                      JOIN ${musicTracks} ON ${musicTracks.id} = ${musicTrackArtists.trackId}
                      WHERE ${musicTrackArtists.artistId} = ${musicArtists.id}
                        AND ${musicTracks.libraryId} = ${libraryId})`
        )!
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderFn = sortOrder === "asc" ? asc : desc;

    // albumCount / dateAdded / name sorting. For albumCount we sort by the
    // aggregate computed via a correlated subquery so paging stays on artists.
    let orderClause;
    switch (sort) {
      case "albumCount":
        orderClause = sortOrder === "asc"
          ? sql`(SELECT COUNT(DISTINCT ${musicAlbumArtists.albumId}) FROM ${musicAlbumArtists} WHERE ${musicAlbumArtists.artistId} = ${musicArtists.id}) ASC`
          : sql`(SELECT COUNT(DISTINCT ${musicAlbumArtists.albumId}) FROM ${musicAlbumArtists} WHERE ${musicAlbumArtists.artistId} = ${musicArtists.id}) DESC`;
        break;
      case "dateAdded":
        orderClause = orderFn(musicArtists.dateAdded);
        break;
      case "name":
      default:
        orderClause = orderFn(sql`COALESCE(${musicArtists.sortName}, ${musicArtists.name})`);
        break;
    }

    const pageRows = db
      .select({
        id: musicArtists.id,
        name: musicArtists.name,
        imagePath: musicArtists.imagePath,
        imageBlur: musicArtists.imageBlur,
      })
      .from(musicArtists)
      .where(where)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset)
      .all();

    const artistIds = pageRows.map((r) => r.id);

    // Batch album counts (distinct albums via musicAlbumArtists) for the page.
    const albumCounts = new Map<string, number>();
    const trackCounts = new Map<string, number>();
    if (artistIds.length > 0) {
      const albumRows = db
        .select({
          artistId: musicAlbumArtists.artistId,
          c: countDistinct(musicAlbumArtists.albumId),
        })
        .from(musicAlbumArtists)
        .where(inArray(musicAlbumArtists.artistId, artistIds))
        .groupBy(musicAlbumArtists.artistId)
        .all();
      for (const row of albumRows) albumCounts.set(row.artistId, row.c);

      const trackRows = db
        .select({
          artistId: musicTrackArtists.artistId,
          c: countDistinct(musicTrackArtists.trackId),
        })
        .from(musicTrackArtists)
        .where(inArray(musicTrackArtists.artistId, artistIds))
        .groupBy(musicTrackArtists.artistId)
        .all();
      for (const row of trackRows) trackCounts.set(row.artistId, row.c);
    }

    const items = pageRows.map((r) => ({
      id: r.id,
      name: r.name,
      imagePath: r.imagePath,
      imageBlur: r.imageBlur,
      albumCount: albumCounts.get(r.id) ?? 0,
      trackCount: trackCounts.get(r.id) ?? 0,
    }));

    const [{ total: totalCount }] = db
      .select({ total: count() })
      .from(musicArtists)
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
    console.error("List artists error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { musicAlbumArtists, musicAlbums, musicArtists } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getAlbumTrackCounts } from "@/lib/music/queries";

// GET /api/music/artists/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const artist = db
      .select({
        id: musicArtists.id,
        name: musicArtists.name,
        imagePath: musicArtists.imagePath,
        imageBlur: musicArtists.imageBlur,
        overview: musicArtists.overview,
      })
      .from(musicArtists)
      .where(eq(musicArtists.id, id))
      .get();

    if (!artist) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Albums linked to this artist, ordered by year desc (nulls last) then title.
    const albumRows = db
      .select({
        id: musicAlbums.id,
        title: musicAlbums.title,
        year: musicAlbums.year,
        coverPath: musicAlbums.coverPath,
        coverBlur: musicAlbums.coverBlur,
      })
      .from(musicAlbumArtists)
      .innerJoin(musicAlbums, eq(musicAlbums.id, musicAlbumArtists.albumId))
      .where(eq(musicAlbumArtists.artistId, id))
      .orderBy(sql`${musicAlbums.year} IS NULL`, sql`${musicAlbums.year} DESC`, musicAlbums.title)
      .all();

    const trackCounts = getAlbumTrackCounts(albumRows.map((a) => a.id));

    const albums = albumRows.map((a) => ({
      id: a.id,
      title: a.title,
      year: a.year,
      coverPath: a.coverPath,
      coverBlur: a.coverBlur,
      trackCount: trackCounts.get(a.id) ?? 0,
    }));

    return NextResponse.json({
      id: artist.id,
      name: artist.name,
      imagePath: artist.imagePath,
      imageBlur: artist.imageBlur,
      overview: artist.overview,
      albums,
    });
  } catch (error) {
    console.error("Get artist error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

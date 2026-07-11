import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  musicAlbumArtists,
  musicAlbums,
  musicArtists,
  musicTracks,
  userTrackData,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { albumTrackOrder, getTrackArtistNames } from "@/lib/music/queries";

// GET /api/music/albums/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const album = db
      .select({
        id: musicAlbums.id,
        title: musicAlbums.title,
        year: musicAlbums.year,
        coverPath: musicAlbums.coverPath,
        coverBlur: musicAlbums.coverBlur,
        genres: musicAlbums.genres,
      })
      .from(musicAlbums)
      .where(eq(musicAlbums.id, id))
      .get();

    if (!album) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const session = await auth();
    const userId = session?.user?.id;

    // Album artists (id + name)
    const artists = db
      .select({ id: musicArtists.id, name: musicArtists.name })
      .from(musicAlbumArtists)
      .innerJoin(musicArtists, eq(musicArtists.id, musicAlbumArtists.artistId))
      .where(eq(musicAlbumArtists.albumId, id))
      .all();

    // Tracks for this album, with per-user favorite/playCount (scoped by userId).
    const trackRows = db
      .select({
        id: musicTracks.id,
        title: musicTracks.title,
        trackNumber: musicTracks.trackNumber,
        discNumber: musicTracks.discNumber,
        durationSeconds: musicTracks.durationSeconds,
        isFavorite: userTrackData.isFavorite,
        playCount: userTrackData.playCount,
      })
      .from(musicTracks)
      .leftJoin(
        userTrackData,
        and(
          eq(userTrackData.trackId, musicTracks.id),
          userId ? eq(userTrackData.userId, userId) : sql`0`
        )
      )
      .where(eq(musicTracks.albumId, id))
      .orderBy(...albumTrackOrder)
      .all();

    const trackIds = trackRows.map((t) => t.id);
    const trackArtistNames = getTrackArtistNames(trackIds);

    const tracks = trackRows.map((t) => ({
      id: t.id,
      title: t.title,
      trackNumber: t.trackNumber,
      discNumber: t.discNumber,
      durationSeconds: t.durationSeconds,
      artistName: trackArtistNames.get(t.id) ?? "",
      isFavorite: t.isFavorite ?? false,
      playCount: t.playCount ?? 0,
    }));

    return NextResponse.json({
      id: album.id,
      title: album.title,
      year: album.year,
      coverPath: album.coverPath,
      coverBlur: album.coverBlur,
      genres: album.genres ? JSON.parse(album.genres) : [],
      artists,
      tracks,
    });
  } catch (error) {
    console.error("Get album error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

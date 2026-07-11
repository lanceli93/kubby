import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { musicAlbums, musicTracks, userTrackData } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  getAlbumArtistNames,
  getAlbumTrackCounts,
  getTrackArtistNames,
} from "@/lib/music/queries";

const HOME_LIMIT = 12;

type AlbumRow = {
  id: string;
  title: string;
  year: number | null;
  coverPath: string | null;
  coverBlur: string | null;
};

/** Stitch album rows into the albums-list item shape (artistName + trackCount). */
function toAlbumItems(rows: AlbumRow[]) {
  const ids = rows.map((r) => r.id);
  const artistNames = getAlbumArtistNames(ids);
  const trackCounts = getAlbumTrackCounts(ids);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    year: r.year,
    coverPath: r.coverPath,
    coverBlur: r.coverBlur,
    artistName: artistNames.get(r.id) ?? "",
    trackCount: trackCounts.get(r.id) ?? 0,
  }));
}

// GET /api/music/home?libraryId=
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");

    const session = await auth();
    const userId = session?.user?.id;

    const albumWhere = libraryId ? eq(musicAlbums.libraryId, libraryId) : undefined;
    const trackWhere = libraryId ? eq(musicTracks.libraryId, libraryId) : undefined;

    const albumSelect = {
      id: musicAlbums.id,
      title: musicAlbums.title,
      year: musicAlbums.year,
      coverPath: musicAlbums.coverPath,
      coverBlur: musicAlbums.coverBlur,
    };

    // recentAlbums — latest by dateAdded desc.
    const recentRows = db
      .select(albumSelect)
      .from(musicAlbums)
      .where(albumWhere)
      .orderBy(desc(musicAlbums.dateAdded))
      .limit(HOME_LIMIT)
      .all();

    // randomAlbums — SQLite RANDOM().
    const randomRows = db
      .select(albumSelect)
      .from(musicAlbums)
      .where(albumWhere)
      .orderBy(sql`RANDOM()`)
      .limit(HOME_LIMIT)
      .all();

    // mostPlayed — top tracks by this user's summed playCount. If the user has
    // no play data (or no session), fall back to most-recently-added tracks.
    const trackSelect = {
      id: musicTracks.id,
      title: musicTracks.title,
      durationSeconds: musicTracks.durationSeconds,
      albumId: musicTracks.albumId,
      trackNumber: musicTracks.trackNumber,
      albumTitle: musicAlbums.title,
      coverPath: musicAlbums.coverPath,
      coverBlur: musicAlbums.coverBlur,
      isFavorite: userTrackData.isFavorite,
    };

    type TrackRow = {
      id: string;
      title: string;
      durationSeconds: number | null;
      albumId: string | null;
      trackNumber: number | null;
      albumTitle: string | null;
      coverPath: string | null;
      coverBlur: string | null;
      isFavorite: boolean | null;
    };
    let mostPlayedRows: TrackRow[] = [];

    if (userId) {
      mostPlayedRows = db
        .select(trackSelect)
        .from(musicTracks)
        .innerJoin(
          userTrackData,
          and(
            eq(userTrackData.trackId, musicTracks.id),
            eq(userTrackData.userId, userId)
          )
        )
        .leftJoin(musicAlbums, eq(musicAlbums.id, musicTracks.albumId))
        .where(
          and(
            ...(trackWhere ? [trackWhere] : []),
            sql`COALESCE(${userTrackData.playCount}, 0) > 0`
          )
        )
        .orderBy(desc(userTrackData.playCount))
        .limit(HOME_LIMIT)
        .all();
    }

    // Fallback: no play data → most recently added tracks (still user-scoped
    // favorite flag when logged in).
    if (mostPlayedRows.length === 0) {
      mostPlayedRows = db
        .select(trackSelect)
        .from(musicTracks)
        .leftJoin(musicAlbums, eq(musicAlbums.id, musicTracks.albumId))
        .leftJoin(
          userTrackData,
          and(
            eq(userTrackData.trackId, musicTracks.id),
            userId ? eq(userTrackData.userId, userId) : sql`0`
          )
        )
        .where(trackWhere)
        .orderBy(desc(musicTracks.dateAdded))
        .limit(HOME_LIMIT)
        .all();
    }

    const mostPlayedArtistNames = getTrackArtistNames(mostPlayedRows.map((r) => r.id));
    const mostPlayed = mostPlayedRows.map((r) => ({
      id: r.id,
      title: r.title,
      durationSeconds: r.durationSeconds,
      artistName: mostPlayedArtistNames.get(r.id) ?? "",
      albumId: r.albumId,
      albumTitle: r.albumTitle,
      coverPath: r.coverPath,
      coverBlur: r.coverBlur,
      trackNumber: r.trackNumber,
      isFavorite: r.isFavorite ?? false,
    }));

    return NextResponse.json({
      recentAlbums: toAlbumItems(recentRows),
      randomAlbums: toAlbumItems(randomRows),
      mostPlayed,
    });
  } catch (error) {
    console.error("Music home error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

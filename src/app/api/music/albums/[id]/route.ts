import { NextRequest, NextResponse } from "next/server";
import path from "path";
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
import {
  deleteFileQuiet,
  removeAlbumCoverArt,
  removeDirIfEmpty,
  pruneOrphanArtists,
} from "@/lib/music/mutations";

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

// PUT /api/music/albums/[id] — edit album metadata.
// Body: { title?, sortTitle?, year?, genres? (string[]) }
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
    const album = db.select({ id: musicAlbums.id }).from(musicAlbums).where(eq(musicAlbums.id, id)).get();
    if (!album) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) updates.title = body.title.trim();
    if (body.sortTitle !== undefined) updates.sortTitle = body.sortTitle?.trim() || null;
    if (body.year !== undefined) {
      const y = Number(body.year);
      updates.year = Number.isFinite(y) && y > 0 ? Math.trunc(y) : null;
    }
    if (Array.isArray(body.genres)) {
      updates.genres = JSON.stringify(body.genres.map((g: unknown) => String(g).trim()).filter(Boolean));
    }

    if (Object.keys(updates).length > 0) {
      db.update(musicAlbums).set(updates).where(eq(musicAlbums.id, id)).run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update album error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/music/albums/[id]?deleteFiles=true
// Removes the album + its tracks (FK cascade), the generated cover art, and any
// now-orphan artists. With deleteFiles, also removes each track's source file
// on disk and the album folder if it ends up empty.
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
    const album = db
      .select({ id: musicAlbums.id, libraryId: musicAlbums.libraryId, folderPath: musicAlbums.folderPath })
      .from(musicAlbums)
      .where(eq(musicAlbums.id, id))
      .get();
    if (!album) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Collect track file paths BEFORE the cascade wipes the rows.
    const trackFiles = db
      .select({ filePath: musicTracks.filePath })
      .from(musicTracks)
      .where(eq(musicTracks.albumId, id))
      .all();

    // DB: deleting the album cascades to tracks + album/track-artist joins.
    db.delete(musicAlbums).where(eq(musicAlbums.id, id)).run();

    // On-disk: always drop the generated cover art (Kubby artifact).
    await removeAlbumCoverArt(album.libraryId, album.id);

    // Optionally delete the user's source files.
    if (deleteFiles) {
      const dirs = new Set<string>();
      for (const t of trackFiles) {
        await deleteFileQuiet(t.filePath);
        dirs.add(path.dirname(t.filePath));
      }
      if (album.folderPath) dirs.add(album.folderPath);
      for (const dir of dirs) await removeDirIfEmpty(dir);
    }

    // Artists left with no album/track references are removed (global sweep).
    pruneOrphanArtists();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete album error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import {
  musicAlbumArtists,
  musicAlbums,
  musicArtists,
  musicTrackArtists,
  musicTracks,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getAlbumTrackCounts } from "@/lib/music/queries";
import {
  deleteFileQuiet,
  removeDirIfEmpty,
  pruneEmptyAlbums,
} from "@/lib/music/mutations";

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

// PUT /api/music/artists/[id] — edit artist metadata.
// Body: { name?, sortName?, overview? }. Name must stay unique.
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
    const artist = db.select({ id: musicArtists.id }).from(musicArtists).where(eq(musicArtists.id, id)).get();
    if (!artist) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      const name = body.name.trim();
      // Reject a rename that collides (case-insensitively) with another artist —
      // the name column is UNIQUE and artists are deduped case-insensitively.
      const clash = db
        .select({ id: musicArtists.id })
        .from(musicArtists)
        .where(sql`lower(${musicArtists.name}) = lower(${name}) and ${musicArtists.id} <> ${id}`)
        .get();
      if (clash) {
        return NextResponse.json({ error: "An artist with that name already exists" }, { status: 409 });
      }
      updates.name = name;
    }
    if (body.sortName !== undefined) updates.sortName = body.sortName?.trim() || null;
    if (body.overview !== undefined) updates.overview = body.overview?.trim() || null;

    if (Object.keys(updates).length > 0) {
      db.update(musicArtists).set(updates).where(eq(musicArtists.id, id)).run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update artist error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/music/artists/[id]?deleteFiles=true
// Deletes the artist and ALL of their tracks/albums in this library (removing an
// artist means removing their catalogue). FK cascade from music_artists drops
// the join rows; we delete the tracks explicitly (with optional source files),
// then prune albums the deletion emptied.
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
    const artist = db.select({ id: musicArtists.id }).from(musicArtists).where(eq(musicArtists.id, id)).get();
    if (!artist) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Tracks credited to this artist (via track-artist join), plus tracks on
    // albums where this artist is the album-artist — the union is the artist's
    // catalogue to remove.
    const trackRows = db
      .selectDistinct({
        id: musicTracks.id,
        filePath: musicTracks.filePath,
        libraryId: musicTracks.libraryId,
      })
      .from(musicTracks)
      .leftJoin(musicTrackArtists, eq(musicTrackArtists.trackId, musicTracks.id))
      .leftJoin(musicAlbumArtists, eq(musicAlbumArtists.albumId, musicTracks.albumId))
      .where(sql`${musicTrackArtists.artistId} = ${id} OR ${musicAlbumArtists.artistId} = ${id}`)
      .all();

    const libraryIds = new Set<string>();
    const dirs = new Set<string>();
    for (const t of trackRows) {
      db.delete(musicTracks).where(eq(musicTracks.id, t.id)).run();
      libraryIds.add(t.libraryId);
      if (deleteFiles) {
        await deleteFileQuiet(t.filePath);
        dirs.add(path.dirname(t.filePath));
      }
    }

    // Delete the artist row itself (cascades any remaining join rows).
    db.delete(musicArtists).where(eq(musicArtists.id, id)).run();

    if (deleteFiles) {
      for (const dir of dirs) await removeDirIfEmpty(dir);
    }

    // Prune albums emptied by the track removals in each affected library.
    for (const libId of libraryIds) await pruneEmptyAlbums(libId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete artist error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

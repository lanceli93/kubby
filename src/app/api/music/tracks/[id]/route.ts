import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { musicTracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  deleteFileQuiet,
  removeDirIfEmpty,
  pruneEmptyAlbums,
  pruneOrphanArtists,
} from "@/lib/music/mutations";

// PUT /api/music/tracks/[id] — edit track metadata.
// Body: { title?, trackNumber?, discNumber?, year?, lyrics? }
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
    const track = db.select({ id: musicTracks.id }).from(musicTracks).where(eq(musicTracks.id, id)).get();
    if (!track) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) updates.title = body.title.trim();
    const numOrNull = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    };
    if (body.trackNumber !== undefined) updates.trackNumber = numOrNull(body.trackNumber);
    if (body.discNumber !== undefined) updates.discNumber = numOrNull(body.discNumber);
    if (body.year !== undefined) updates.year = numOrNull(body.year);
    if (body.lyrics !== undefined) updates.lyrics = typeof body.lyrics === "string" ? body.lyrics : null;

    if (Object.keys(updates).length > 0) {
      db.update(musicTracks).set(updates).where(eq(musicTracks.id, id)).run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update track error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/music/tracks/[id]?deleteFiles=true
// Removes the track (FK cascade drops track-artist joins), then prunes any
// album/artist left empty. With deleteFiles, also removes the source file and
// its folder if that leaves it empty.
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
    const track = db
      .select({ filePath: musicTracks.filePath, libraryId: musicTracks.libraryId })
      .from(musicTracks)
      .where(eq(musicTracks.id, id))
      .get();
    if (!track) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    db.delete(musicTracks).where(eq(musicTracks.id, id)).run();

    if (deleteFiles) {
      await deleteFileQuiet(track.filePath);
      await removeDirIfEmpty(path.dirname(track.filePath));
    }

    // An album/artist may now be empty — prune within this library, then globally.
    await pruneEmptyAlbums(track.libraryId);
    pruneOrphanArtists();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete track error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

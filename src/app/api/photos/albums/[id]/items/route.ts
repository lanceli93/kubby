import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { photoAlbums, photoAlbumItems, photoItems } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

// POST /api/photos/albums/[id]/items  { itemIds: string[] }
// Add photos to an album. Already-present photos are ignored (unique index).
// Only items in the same library as the album are accepted.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: albumId } = await params;
  try {
    const body = await request.json();
    const itemIds: string[] = Array.isArray(body.itemIds)
      ? body.itemIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (itemIds.length === 0) {
      return NextResponse.json({ error: "itemIds required" }, { status: 400 });
    }

    const album = db
      .select({ id: photoAlbums.id, libraryId: photoAlbums.libraryId })
      .from(photoAlbums)
      .where(eq(photoAlbums.id, albumId))
      .get();
    if (!album) return NextResponse.json({ error: "Album not found" }, { status: 404 });

    // Keep only ids that exist and belong to the album's library.
    const valid = db
      .select({ id: photoItems.id })
      .from(photoItems)
      .where(and(eq(photoItems.libraryId, album.libraryId), inArray(photoItems.id, itemIds)))
      .all()
      .map((r) => r.id);
    if (valid.length === 0) return NextResponse.json({ added: 0 });

    // Insert membership rows, skipping any already-present (unique index on
    // album_id+item_id). `.changes` reports how many were actually added.
    const res = db
      .insert(photoAlbumItems)
      .values(valid.map((itemId) => ({ albumId, itemId })))
      .onConflictDoNothing()
      .run();

    return NextResponse.json({ added: res.changes });
  } catch (error) {
    console.error("Add album items error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/photos/albums/[id]/items  { itemIds: string[] }
// Remove photos from an album (photos themselves are untouched).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: albumId } = await params;
  try {
    const body = await request.json();
    const itemIds: string[] = Array.isArray(body.itemIds)
      ? body.itemIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (itemIds.length === 0) {
      return NextResponse.json({ error: "itemIds required" }, { status: 400 });
    }

    db.delete(photoAlbumItems)
      .where(and(eq(photoAlbumItems.albumId, albumId), inArray(photoAlbumItems.itemId, itemIds)))
      .run();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Remove album items error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

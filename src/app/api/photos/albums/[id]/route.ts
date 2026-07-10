import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { photoAlbums, photoAlbumItems, photoItems } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// GET /api/photos/albums/[id] — single album header (name, count, resolved cover).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const album = db
      .select({
        id: photoAlbums.id,
        libraryId: photoAlbums.libraryId,
        name: photoAlbums.name,
        coverItemId: photoAlbums.coverItemId,
        createdAt: photoAlbums.createdAt,
        itemCount: sql<number>`(SELECT COUNT(*) FROM photo_album_items WHERE album_id = "photo_albums"."id")`,
      })
      .from(photoAlbums)
      .where(eq(photoAlbums.id, id))
      .get();

    if (!album) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Resolve cover (explicit-if-member, else newest member).
    let coverId: string | null = null;
    if (album.coverItemId) {
      const stillMember = db
        .select({ itemId: photoAlbumItems.itemId })
        .from(photoAlbumItems)
        .where(and(eq(photoAlbumItems.albumId, id), eq(photoAlbumItems.itemId, album.coverItemId)))
        .get();
      if (stillMember) coverId = album.coverItemId;
    }
    if (!coverId) {
      const newest = db
        .select({ id: photoItems.id })
        .from(photoAlbumItems)
        .innerJoin(photoItems, eq(photoAlbumItems.itemId, photoItems.id))
        .where(eq(photoAlbumItems.albumId, id))
        .orderBy(desc(photoItems.takenAt), desc(photoItems.id))
        .limit(1)
        .get();
      coverId = newest?.id ?? null;
    }

    return NextResponse.json({ ...album, coverItemId: coverId });
  } catch (error) {
    console.error("Get album error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/photos/albums/[id]  { name?, coverItemId? } — rename / set cover.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const patch: { name?: string; coverItemId?: string } = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      patch.name = name;
    }
    if (typeof body.coverItemId === "string") {
      patch.coverItemId = body.coverItemId;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const existing = db.select({ id: photoAlbums.id }).from(photoAlbums).where(eq(photoAlbums.id, id)).get();
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    db.update(photoAlbums).set(patch).where(eq(photoAlbums.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update album error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/photos/albums/[id] — remove the album (membership rows cascade;
// the underlying photos are untouched).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    db.delete(photoAlbums).where(eq(photoAlbums.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete album error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

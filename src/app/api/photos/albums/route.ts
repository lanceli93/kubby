import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { photoAlbums, photoAlbumItems, photoItems, mediaLibraries } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// GET /api/photos/albums?libraryId=
// List albums (optionally scoped to one library) with member count and a
// resolved cover item id. Cover = explicit coverItemId, else the newest member.
export async function GET(request: NextRequest) {
  try {
    const libraryId = request.nextUrl.searchParams.get("libraryId");

    const rows = db
      .select({
        id: photoAlbums.id,
        libraryId: photoAlbums.libraryId,
        name: photoAlbums.name,
        coverItemId: photoAlbums.coverItemId,
        sortOrder: photoAlbums.sortOrder,
        createdAt: photoAlbums.createdAt,
        itemCount: sql<number>`(SELECT COUNT(*) FROM photo_album_items WHERE album_id = "photo_albums"."id")`,
      })
      .from(photoAlbums)
      .where(libraryId ? eq(photoAlbums.libraryId, libraryId) : undefined)
      .orderBy(desc(photoAlbums.sortOrder), desc(photoAlbums.createdAt))
      .all();

    // Resolve each album's cover to a photo item id: prefer the explicit
    // coverItemId (if it's still a member), else the most-recently-taken member.
    const albums = rows.map((album) => {
      let coverId: string | null = null;
      if (album.coverItemId) {
        const stillMember = db
          .select({ itemId: photoAlbumItems.itemId })
          .from(photoAlbumItems)
          .where(and(eq(photoAlbumItems.albumId, album.id), eq(photoAlbumItems.itemId, album.coverItemId)))
          .get();
        if (stillMember) coverId = album.coverItemId;
      }
      if (!coverId) {
        const newest = db
          .select({ id: photoItems.id })
          .from(photoAlbumItems)
          .innerJoin(photoItems, eq(photoAlbumItems.itemId, photoItems.id))
          .where(eq(photoAlbumItems.albumId, album.id))
          .orderBy(desc(photoItems.takenAt), desc(photoItems.id))
          .limit(1)
          .get();
        coverId = newest?.id ?? null;
      }
      return { ...album, coverItemId: coverId };
    });

    return NextResponse.json(albums);
  } catch (error) {
    console.error("List albums error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/photos/albums  { name, libraryId }
// Creates an empty album in a photo library.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const libraryId = typeof body.libraryId === "string" ? body.libraryId : "";

    if (!name || !libraryId) {
      return NextResponse.json({ error: "name and libraryId are required" }, { status: 400 });
    }

    const library = db
      .select({ id: mediaLibraries.id, type: mediaLibraries.type })
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, libraryId))
      .get();
    if (!library || library.type !== "photo") {
      return NextResponse.json({ error: "Not a photo library" }, { status: 400 });
    }

    const id = uuidv4();
    db.insert(photoAlbums).values({ id, libraryId, name }).run();

    return NextResponse.json({ id, libraryId, name, coverItemId: null, itemCount: 0 }, { status: 201 });
  } catch (error) {
    console.error("Create album error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

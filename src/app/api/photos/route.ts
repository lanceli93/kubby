import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { photoItems, photoAlbumItems } from "@/lib/db/schema";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";

// GET /api/photos?cursor=&limit=&libraryId=&albumId=
// Timeline pagination, ordered by takenAt DESC with id as a same-millisecond
// tiebreak. Cursor format: "{takenAt}_{id}" (the last item of the previous page).
// libraryId scopes to one photo library; albumId scopes to one album's members.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const libraryId = searchParams.get("libraryId");
    const albumId = searchParams.get("albumId");
    const cursorParam = searchParams.get("cursor");
    const limitParam = searchParams.get("limit");
    const limit = Math.max(1, Math.min(500, parseInt(limitParam || "100", 10) || 100));

    const conditions = [];
    if (libraryId) {
      conditions.push(eq(photoItems.libraryId, libraryId));
    }
    if (albumId) {
      // Restrict to the album's members. A subquery keeps the same cursor
      // pagination path (still ordered by taken_at on photo_items).
      const memberIds = db
        .select({ id: photoAlbumItems.itemId })
        .from(photoAlbumItems)
        .where(eq(photoAlbumItems.albumId, albumId));
      conditions.push(inArray(photoItems.id, memberIds));
    }

    if (cursorParam) {
      const sepIdx = cursorParam.lastIndexOf("_");
      if (sepIdx === -1) {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
      const cursorTakenAt = parseInt(cursorParam.slice(0, sepIdx), 10);
      const cursorId = cursorParam.slice(sepIdx + 1);
      if (Number.isNaN(cursorTakenAt) || !cursorId) {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
      conditions.push(
        or(
          lt(photoItems.takenAt, cursorTakenAt),
          and(eq(photoItems.takenAt, cursorTakenAt), lt(photoItems.id, cursorId))
        )!
      );
    }

    const results = db
      .select({
        id: photoItems.id,
        isVideo: photoItems.isVideo,
        takenAt: photoItems.takenAt,
        width: photoItems.width,
        height: photoItems.height,
        durationSeconds: photoItems.durationSeconds,
        fileName: photoItems.fileName,
      })
      .from(photoItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(photoItems.takenAt), desc(photoItems.id))
      .limit(limit)
      .all();

    const last = results[results.length - 1];
    const nextCursor = results.length < limit || !last ? null : `${last.takenAt}_${last.id}`;

    return NextResponse.json({ items: results, nextCursor });
  } catch (error) {
    console.error("List photos error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

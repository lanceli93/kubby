import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { photoItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-guard";
import { deletePhotoItem } from "@/lib/photos/delete-items";

// GET /api/photos/[id] - single item detail (EXIF panel)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const item = db.select().from(photoItems).where(eq(photoItems.id, id)).get();
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let exif: Record<string, unknown> | null = null;
    if (item.exifJson) {
      try {
        exif = JSON.parse(item.exifJson);
      } catch {
        exif = null;
      }
    }

    return NextResponse.json({ ...item, exif });
  } catch (error) {
    console.error("Get photo item error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/photos/[id] — admin-only. Permanently removes the photo/video:
// source file on disk, generated thumbs/preview, and the DB row. If the file
// can't be deleted (read-only, locked) the row is kept and an error returned.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  try {
    const result = deletePhotoItem(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete photo item error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

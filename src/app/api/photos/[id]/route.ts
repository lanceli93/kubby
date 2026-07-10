import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { photoItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

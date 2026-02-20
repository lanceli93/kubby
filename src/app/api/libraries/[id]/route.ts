import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mediaLibraries } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/libraries/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const library = db
      .select({
        id: mediaLibraries.id,
        name: mediaLibraries.name,
        type: mediaLibraries.type,
        folderPath: mediaLibraries.folderPath,
        lastScannedAt: mediaLibraries.lastScannedAt,
        movieCount: sql<number>`(SELECT COUNT(*) FROM movies WHERE media_library_id = "media_libraries"."id")`,
      })
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, id))
      .get();

    if (!library) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(library);
  } catch (error) {
    console.error("Get library error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/libraries/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { name, folderPath, scraperEnabled } = body;

    const existing = db
      .select()
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, id))
      .get();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (folderPath !== undefined) updates.folderPath = folderPath;
    if (scraperEnabled !== undefined) updates.scraperEnabled = scraperEnabled;

    if (Object.keys(updates).length > 0) {
      db.update(mediaLibraries)
        .set(updates)
        .where(eq(mediaLibraries.id, id))
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update library error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/libraries/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    db.delete(mediaLibraries).where(eq(mediaLibraries.id, id)).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete library error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

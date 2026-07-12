import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tvEpisodeBookmarks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import fs from "fs";

// PUT /api/tv/episodes/[id]/bookmarks/[bookmarkId] - Update bookmark
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; bookmarkId: string }> }
) {
  const { bookmarkId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = db
      .select()
      .from(tvEpisodeBookmarks)
      .where(
        and(
          eq(tvEpisodeBookmarks.id, bookmarkId),
          eq(tvEpisodeBookmarks.userId, session.user.id)
        )
      )
      .get();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.iconType !== undefined) updateData.iconType = body.iconType;
    if (body.tags !== undefined) updateData.tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : body.tags;
    if (body.note !== undefined) updateData.note = body.note;

    db.update(tvEpisodeBookmarks)
      .set(updateData)
      .where(eq(tvEpisodeBookmarks.id, bookmarkId))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update bookmark error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/tv/episodes/[id]/bookmarks/[bookmarkId] - Delete bookmark
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; bookmarkId: string }> }
) {
  const { bookmarkId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = db
      .select()
      .from(tvEpisodeBookmarks)
      .where(
        and(
          eq(tvEpisodeBookmarks.id, bookmarkId),
          eq(tvEpisodeBookmarks.userId, session.user.id)
        )
      )
      .get();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Delete thumbnail file if exists
    if (existing.thumbnailPath) {
      try {
        await fs.promises.unlink(existing.thumbnailPath);
      } catch {
        // File may not exist, ignore
      }
    }

    db.delete(tvEpisodeBookmarks)
      .where(eq(tvEpisodeBookmarks.id, bookmarkId))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete bookmark error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

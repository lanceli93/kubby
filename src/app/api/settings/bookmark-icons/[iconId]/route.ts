import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookmarkIcons, movieBookmarks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import fs from "fs/promises";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ iconId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { iconId } = await params;
    const body = await req.json();
    const { label } = body;

    if (!label || !label.trim()) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }

    // Verify ownership
    const icon = db
      .select()
      .from(bookmarkIcons)
      .where(and(eq(bookmarkIcons.id, iconId), eq(bookmarkIcons.userId, session.user.id)))
      .get();

    if (!icon) {
      return NextResponse.json({ error: "Icon not found" }, { status: 404 });
    }

    db.update(bookmarkIcons)
      .set({ label: label.trim() })
      .where(eq(bookmarkIcons.id, iconId))
      .run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT /api/settings/bookmark-icons/[iconId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ iconId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { iconId } = await params;

    // Verify ownership
    const icon = db
      .select()
      .from(bookmarkIcons)
      .where(and(eq(bookmarkIcons.id, iconId), eq(bookmarkIcons.userId, session.user.id)))
      .get();

    if (!icon) {
      return NextResponse.json({ error: "Icon not found" }, { status: 404 });
    }

    // Delete file from disk (imagePath is already absolute)
    try {
      await fs.unlink(icon.imagePath);
    } catch { /* file may not exist */ }

    // Reset bookmarks using this icon to default "bookmark"
    db.update(movieBookmarks)
      .set({ iconType: "bookmark" })
      .where(and(
        eq(movieBookmarks.userId, session.user.id),
        eq(movieBookmarks.iconType, iconId),
      ))
      .run();

    // Delete from DB
    db.delete(bookmarkIcons)
      .where(eq(bookmarkIcons.id, iconId))
      .run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/settings/bookmark-icons/[iconId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

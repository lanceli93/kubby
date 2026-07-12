import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { tvEpisodeBookmarks } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getBookmarksDir } from "@/lib/paths";
import fs from "fs";
import path from "path";

// GET /api/tv/episodes/[id]/bookmarks - List bookmarks for current user
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: episodeId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = db
      .select()
      .from(tvEpisodeBookmarks)
      .where(
        and(
          eq(tvEpisodeBookmarks.userId, session.user.id),
          eq(tvEpisodeBookmarks.episodeId, episodeId)
        )
      )
      .orderBy(asc(tvEpisodeBookmarks.timestampSeconds))
      .all();

    const result = rows.map((row) => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
      viewState: row.viewState ? JSON.parse(row.viewState) : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get bookmarks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/tv/episodes/[id]/bookmarks - Create bookmark
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: episodeId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const timestampSeconds = parseInt(formData.get("timestampSeconds") as string, 10);
    const iconType = (formData.get("iconType") as string) || "bookmark";
    const tagsRaw = formData.get("tags") as string | null;
    const note = formData.get("note") as string | null;
    const viewState = formData.get("viewState") as string | null;
    const thumbnailAspectRaw = formData.get("thumbnailAspect") as string | null;
    const thumbnailAspect = thumbnailAspectRaw ? parseFloat(thumbnailAspectRaw) || null : null;
    const thumbnail = formData.get("thumbnail") as File | null;

    if (isNaN(timestampSeconds)) {
      return NextResponse.json({ error: "Invalid timestampSeconds" }, { status: 400 });
    }

    const bookmarkId = uuidv4();
    let thumbnailPath: string | null = null;

    // Save thumbnail if provided
    if (thumbnail && thumbnail.size > 0) {
      const dir = path.join(getBookmarksDir(), session.user.id, episodeId);
      await fs.promises.mkdir(dir, { recursive: true });
      thumbnailPath = path.join(dir, `${bookmarkId}.jpg`);
      const buffer = Buffer.from(await thumbnail.arrayBuffer());
      await fs.promises.writeFile(thumbnailPath, buffer);
    }

    const tags = tagsRaw ? tagsRaw : null;

    db.insert(tvEpisodeBookmarks)
      .values({
        id: bookmarkId,
        userId: session.user.id,
        episodeId,
        timestampSeconds,
        iconType,
        tags,
        note: note || null,
        thumbnailPath,
        thumbnailAspect,
        viewState: viewState || null,
      })
      .run();

    return NextResponse.json({
      id: bookmarkId,
      userId: session.user.id,
      episodeId,
      timestampSeconds,
      iconType,
      tags: tags ? JSON.parse(tags) : [],
      note: note || null,
      thumbnailPath,
      thumbnailAspect,
      viewState: viewState ? JSON.parse(viewState) : null,
    });
  } catch (error) {
    console.error("Create bookmark error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

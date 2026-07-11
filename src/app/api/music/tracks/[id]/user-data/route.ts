import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { userTrackData } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/music/tracks/[id]/user-data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = db
      .select()
      .from(userTrackData)
      .where(
        and(
          eq(userTrackData.userId, session.user.id),
          eq(userTrackData.trackId, trackId)
        )
      )
      .get();

    return NextResponse.json({
      isFavorite: data?.isFavorite ?? false,
      playCount: data?.playCount ?? 0,
    });
  } catch (error) {
    console.error("Get track user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/music/tracks/[id]/user-data
// Body: { isFavorite?: boolean, incrementPlay?: boolean }
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: trackId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const userId = session.user.id;

    const existing = db
      .select()
      .from(userTrackData)
      .where(
        and(
          eq(userTrackData.userId, userId),
          eq(userTrackData.trackId, trackId)
        )
      )
      .get();

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (body.isFavorite !== undefined) updateData.isFavorite = body.isFavorite;
      if (body.incrementPlay) {
        updateData.playCount = (existing.playCount ?? 0) + 1;
        updateData.lastPlayedAt = new Date().toISOString();
      }
      if (Object.keys(updateData).length > 0) {
        db.update(userTrackData)
          .set(updateData)
          .where(eq(userTrackData.id, existing.id))
          .run();
      }
    } else {
      db.insert(userTrackData)
        .values({
          id: uuidv4(),
          userId,
          trackId,
          playCount: body.incrementPlay ? 1 : 0,
          isFavorite: body.isFavorite ?? false,
          lastPlayedAt: body.incrementPlay ? new Date().toISOString() : null,
        })
        .run();
    }

    const updated = db
      .select()
      .from(userTrackData)
      .where(
        and(
          eq(userTrackData.userId, userId),
          eq(userTrackData.trackId, trackId)
        )
      )
      .get();

    return NextResponse.json({
      isFavorite: updated?.isFavorite ?? false,
      playCount: updated?.playCount ?? 0,
    });
  } catch (error) {
    console.error("Update track user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

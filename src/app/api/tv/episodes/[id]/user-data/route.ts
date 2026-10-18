import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { userEpisodeData } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { touchShowLastPlayed } from "@/lib/tv/user-data";

// GET /api/tv/episodes/[id]/user-data
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
    const data = db
      .select()
      .from(userEpisodeData)
      .where(
        and(
          eq(userEpisodeData.userId, session.user.id),
          eq(userEpisodeData.episodeId, episodeId)
        )
      )
      .get();

    const result = data
      ? {
          playbackPositionSeconds: data.playbackPositionSeconds ?? 0,
          isPlayed: data.isPlayed ?? false,
          playCount: data.playCount ?? 0,
          personalRating: data.personalRating,
          vrLayout: data.vrLayout ?? null,
        }
      : {
          playbackPositionSeconds: 0,
          isPlayed: false,
          playCount: 0,
          personalRating: null,
          vrLayout: null,
        };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get tv episode user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/tv/episodes/[id]/user-data
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: episodeId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const userId = session.user.id;
    const now = new Date().toISOString();

    // `countPlay: true` is sent by the player on the first progress save of a
    // playback session — it counts one play (playCount + 1).
    const countPlay = body.countPlay === true;

    // Playback-related saves bump lastPlayedAt (both on the episode row and,
    // below, on the parent show row that drives next-up ordering).
    const touchesPlayback =
      body.playbackPositionSeconds !== undefined || body.isPlayed !== undefined || countPlay;

    const existing = db
      .select()
      .from(userEpisodeData)
      .where(and(eq(userEpisodeData.userId, userId), eq(userEpisodeData.episodeId, episodeId)))
      .get();

    // Explicitly marking watched/unwatched (isPlayed true OR false) without a
    // position resets the resume point, so the episode stops showing as
    // in-progress. A caller that sends a position alongside isPlayed keeps it.
    const resetsResume =
      body.isPlayed !== undefined && body.playbackPositionSeconds === undefined;

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (body.playbackPositionSeconds !== undefined)
        updateData.playbackPositionSeconds = body.playbackPositionSeconds;
      else if (resetsResume)
        updateData.playbackPositionSeconds = 0;
      if (body.isPlayed !== undefined) updateData.isPlayed = body.isPlayed;
      if (body.playCount !== undefined) updateData.playCount = body.playCount;
      else if (countPlay)
        updateData.playCount = sql`coalesce(${userEpisodeData.playCount}, 0) + 1`;
      if (body.personalRating !== undefined) updateData.personalRating = body.personalRating;
      if (body.vrLayout !== undefined) updateData.vrLayout = body.vrLayout;
      if (touchesPlayback) updateData.lastPlayedAt = now;

      db.update(userEpisodeData)
        .set(updateData)
        .where(eq(userEpisodeData.id, existing.id))
        .run();
    } else {
      db.insert(userEpisodeData)
        .values({
          id: uuidv4(),
          userId,
          episodeId,
          playbackPositionSeconds: body.playbackPositionSeconds || 0,
          playCount: body.playCount !== undefined ? body.playCount || 0 : countPlay ? 1 : 0,
          isPlayed: body.isPlayed || false,
          personalRating: body.personalRating ?? null,
          vrLayout: body.vrLayout ?? null,
          lastPlayedAt: touchesPlayback ? now : null,
        })
        .run();
    }

    // On a playback save, bump the parent show's lastPlayedAt so the show
    // surfaces (and orders) in the next-up row.
    if (touchesPlayback) touchShowLastPlayed(userId, episodeId, now);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update tv episode user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { userMovieData } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/movies/[id]/user-data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: movieId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = db
      .select()
      .from(userMovieData)
      .where(
        and(
          eq(userMovieData.userId, session.user.id),
          eq(userMovieData.movieId, movieId)
        )
      )
      .get();

    const result = data
      ? {
          ...data,
          dimensionRatings: data.dimensionRatings ? JSON.parse(data.dimensionRatings) : null,
        }
      : {
          playbackPositionSeconds: 0,
          currentDisc: 1,
          playCount: 0,
          isPlayed: false,
          isFavorite: false,
          personalRating: null,
          dimensionRatings: null,
        };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/movies/[id]/user-data
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: movieId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const userId = session.user.id;

    const existing = db
      .select()
      .from(userMovieData)
      .where(
        and(
          eq(userMovieData.userId, userId),
          eq(userMovieData.movieId, movieId)
        )
      )
      .get();

    // Explicitly marking watched/unwatched (isPlayed true OR false) without a
    // position resets the resume point, so the movie leaves Continue Watching
    // and the next play starts from the top. A caller that sends a position
    // (or disc) alongside isPlayed — e.g. the player — keeps its own values.
    const resetsResume =
      body.isPlayed !== undefined && body.playbackPositionSeconds === undefined;

    // `countPlay: true` is sent by the player on the first progress save of a
    // playback session — it counts one play (playCount + 1).
    const countPlay = body.countPlay === true;
    const touchesPlayback =
      body.playbackPositionSeconds !== undefined || body.isPlayed !== undefined || countPlay;

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (body.playbackPositionSeconds !== undefined)
        updateData.playbackPositionSeconds = body.playbackPositionSeconds;
      else if (resetsResume)
        updateData.playbackPositionSeconds = 0;
      if (body.currentDisc !== undefined)
        updateData.currentDisc = body.currentDisc;
      else if (resetsResume)
        updateData.currentDisc = 1;
      if (body.isPlayed !== undefined)
        updateData.isPlayed = body.isPlayed;
      if (body.isFavorite !== undefined)
        updateData.isFavorite = body.isFavorite;
      if (body.playCount !== undefined)
        updateData.playCount = body.playCount;
      else if (countPlay)
        updateData.playCount = sql`coalesce(${userMovieData.playCount}, 0) + 1`;
      if (body.personalRating !== undefined)
        updateData.personalRating = body.personalRating;
      if (body.dimensionRatings !== undefined)
        updateData.dimensionRatings = body.dimensionRatings ? JSON.stringify(body.dimensionRatings) : null;
      if (body.vrLayout !== undefined)
        updateData.vrLayout = body.vrLayout;
      // Update lastPlayedAt on any playback-related save (progress, completion, play count)
      if (touchesPlayback)
        updateData.lastPlayedAt = new Date().toISOString();

      db.update(userMovieData)
        .set(updateData)
        .where(eq(userMovieData.id, existing.id))
        .run();
    } else {
      db.insert(userMovieData)
        .values({
          id: uuidv4(),
          userId,
          movieId,
          playbackPositionSeconds: body.playbackPositionSeconds || 0,
          currentDisc: body.currentDisc || 1,
          playCount: body.playCount !== undefined ? body.playCount || 0 : countPlay ? 1 : 0,
          isPlayed: body.isPlayed || false,
          isFavorite: body.isFavorite || false,
          personalRating: body.personalRating ?? null,
          dimensionRatings: body.dimensionRatings ? JSON.stringify(body.dimensionRatings) : null,
          vrLayout: body.vrLayout ?? null,
          lastPlayedAt: (body.playbackPositionSeconds !== undefined || body.isPlayed || countPlay) ? new Date().toISOString() : null,
        })
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

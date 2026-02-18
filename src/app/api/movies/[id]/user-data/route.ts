import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { userMovieData } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
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

    return NextResponse.json(data || {
      playbackPositionSeconds: 0,
      playCount: 0,
      isPlayed: false,
      isFavorite: false,
      personalRating: null,
    });
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

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (body.playbackPositionSeconds !== undefined)
        updateData.playbackPositionSeconds = body.playbackPositionSeconds;
      if (body.isPlayed !== undefined)
        updateData.isPlayed = body.isPlayed;
      if (body.isFavorite !== undefined)
        updateData.isFavorite = body.isFavorite;
      if (body.playCount !== undefined)
        updateData.playCount = body.playCount;
      if (body.personalRating !== undefined)
        updateData.personalRating = body.personalRating;
      if (body.isPlayed === true)
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
          playCount: body.playCount || 0,
          isPlayed: body.isPlayed || false,
          isFavorite: body.isFavorite || false,
          personalRating: body.personalRating ?? null,
          lastPlayedAt: body.isPlayed ? new Date().toISOString() : null,
        })
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

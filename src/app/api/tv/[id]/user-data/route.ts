import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { userTvShowData } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/tv/[id]/user-data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: showId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = db
      .select()
      .from(userTvShowData)
      .where(
        and(
          eq(userTvShowData.userId, session.user.id),
          eq(userTvShowData.showId, showId)
        )
      )
      .get();

    const result = data
      ? {
          isFavorite: data.isFavorite ?? false,
          personalRating: data.personalRating,
          dimensionRatings: data.dimensionRatings ? JSON.parse(data.dimensionRatings) : null,
        }
      : {
          isFavorite: false,
          personalRating: null,
          dimensionRatings: null,
        };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get tv show user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/tv/[id]/user-data
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: showId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const userId = session.user.id;

    const existing = db
      .select()
      .from(userTvShowData)
      .where(and(eq(userTvShowData.userId, userId), eq(userTvShowData.showId, showId)))
      .get();

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (body.isFavorite !== undefined) updateData.isFavorite = body.isFavorite;
      if (body.personalRating !== undefined) updateData.personalRating = body.personalRating;
      if (body.dimensionRatings !== undefined)
        updateData.dimensionRatings = body.dimensionRatings
          ? JSON.stringify(body.dimensionRatings)
          : null;

      db.update(userTvShowData)
        .set(updateData)
        .where(eq(userTvShowData.id, existing.id))
        .run();
    } else {
      db.insert(userTvShowData)
        .values({
          id: uuidv4(),
          userId,
          showId,
          isFavorite: body.isFavorite || false,
          personalRating: body.personalRating ?? null,
          dimensionRatings: body.dimensionRatings ? JSON.stringify(body.dimensionRatings) : null,
        })
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update tv show user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

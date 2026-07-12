import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { userTvPersonData } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/tv/people/[id]/user-data
//
// Isolated TV-domain person user-data — reads/writes user_tv_person_data ONLY,
// NEVER the cinema user_person_data table. Mirrors /api/people/[id]/user-data.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: personId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = db
      .select()
      .from(userTvPersonData)
      .where(
        and(
          eq(userTvPersonData.userId, session.user.id),
          eq(userTvPersonData.personId, personId)
        )
      )
      .get();

    const result = data
      ? {
          ...data,
          dimensionRatings: data.dimensionRatings ? JSON.parse(data.dimensionRatings) : null,
        }
      : { personalRating: null, dimensionRatings: null, isFavorite: false };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get tv person user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/tv/people/[id]/user-data
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: personId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const userId = session.user.id;

    const existing = db
      .select()
      .from(userTvPersonData)
      .where(
        and(
          eq(userTvPersonData.userId, userId),
          eq(userTvPersonData.personId, personId)
        )
      )
      .get();

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (body.personalRating !== undefined)
        updateData.personalRating = body.personalRating;
      if (body.dimensionRatings !== undefined)
        updateData.dimensionRatings = body.dimensionRatings ? JSON.stringify(body.dimensionRatings) : null;
      if (body.isFavorite !== undefined)
        updateData.isFavorite = body.isFavorite;

      db.update(userTvPersonData)
        .set(updateData)
        .where(eq(userTvPersonData.id, existing.id))
        .run();
    } else {
      db.insert(userTvPersonData)
        .values({
          id: crypto.randomUUID(),
          userId,
          personId,
          personalRating: body.personalRating ?? null,
          dimensionRatings: body.dimensionRatings ? JSON.stringify(body.dimensionRatings) : null,
          isFavorite: body.isFavorite ?? false,
        })
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update tv person user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

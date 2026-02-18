import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { userPersonData } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/people/[id]/user-data
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
      .from(userPersonData)
      .where(
        and(
          eq(userPersonData.userId, session.user.id),
          eq(userPersonData.personId, personId)
        )
      )
      .get();

    const result = data
      ? {
          ...data,
          dimensionRatings: data.dimensionRatings ? JSON.parse(data.dimensionRatings) : null,
        }
      : { personalRating: null, dimensionRatings: null };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get person user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/people/[id]/user-data
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
      .from(userPersonData)
      .where(
        and(
          eq(userPersonData.userId, userId),
          eq(userPersonData.personId, personId)
        )
      )
      .get();

    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (body.personalRating !== undefined)
        updateData.personalRating = body.personalRating;
      if (body.dimensionRatings !== undefined)
        updateData.dimensionRatings = body.dimensionRatings ? JSON.stringify(body.dimensionRatings) : null;

      db.update(userPersonData)
        .set(updateData)
        .where(eq(userPersonData.id, existing.id))
        .run();
    } else {
      db.insert(userPersonData)
        .values({
          id: uuidv4(),
          userId,
          personId,
          personalRating: body.personalRating ?? null,
          dimensionRatings: body.dimensionRatings ? JSON.stringify(body.dimensionRatings) : null,
        })
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update person user data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

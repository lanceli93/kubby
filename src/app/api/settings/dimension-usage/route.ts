import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userMovieData, userPersonData } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/settings/dimension-usage?type=movie|person&name=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const name = searchParams.get("name");

    if (!type || !name || !["movie", "person"].includes(type)) {
      return NextResponse.json({ error: "Missing type or name" }, { status: 400 });
    }

    const jsonPath = `$."${name}"`;
    const table = type === "movie" ? userMovieData : userPersonData;
    const userIdCol = type === "movie" ? userMovieData.userId : userPersonData.userId;
    const ratingsCol = type === "movie" ? userMovieData.dimensionRatings : userPersonData.dimensionRatings;

    const result = db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(
        and(
          eq(userIdCol, session.user.id),
          sql`json_extract(${ratingsCol}, ${jsonPath}) IS NOT NULL`
        )
      )
      .get();

    return NextResponse.json({ count: result?.count ?? 0 });
  } catch (error) {
    console.error("Dimension usage error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

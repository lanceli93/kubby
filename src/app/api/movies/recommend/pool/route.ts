import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { getPool, parseFiltersFromSearchParams } from "@/lib/recommend/engine";

// GET /api/movies/recommend/pool — the filtered candidate pile (cinema only).
// Filters as query params (genres/tags comma-separated). No de-dup here: the
// pile is the visual pool, the draw is the recommendation.
export async function GET(request: NextRequest) {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;
  try {
    const filters = parseFiltersFromSearchParams(new URL(request.url).searchParams);
    return NextResponse.json(getPool(guard.user.id, filters));
  } catch (error) {
    console.error("Recommend pool error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

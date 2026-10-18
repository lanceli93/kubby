import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { getPool, parseFiltersFromSearchParams, parsePoolSeed } from "@/lib/recommend/engine";

// GET /api/movies/recommend/pool — the filtered candidate pile (cinema only;
// clips are the caller's own video bookmarks).
// Filters as query params (genres/tags comma-separated), plus an optional
// `seed` that makes the sample deterministic (stable pile across filter
// changes). No de-dup here: the pile is the visual pool, the draw is the
// recommendation.
export async function GET(request: NextRequest) {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;
  try {
    const sp = new URL(request.url).searchParams;
    const filters = parseFiltersFromSearchParams(sp);
    return NextResponse.json(getPool(guard.user.id, filters, { seed: parsePoolSeed(sp) }));
  } catch (error) {
    console.error("Recommend pool error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

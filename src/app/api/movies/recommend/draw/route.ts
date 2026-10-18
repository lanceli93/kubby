import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { drawHand, parseDrawRequest } from "@/lib/recommend/engine";

// POST /api/movies/recommend/draw — body DrawRequest → DrawResponse. Records a
// 'shown' history row per returned card (30-day de-dup) and prunes old rows.
export async function POST(request: NextRequest) {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;
  try {
    const body = await request.json().catch(() => null);
    const req = parseDrawRequest(body);
    if (!req) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json(drawHand(guard.user.id, req));
  } catch (error) {
    console.error("Recommend draw error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

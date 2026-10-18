import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { parseHistoryRequest, recordHistory } from "@/lib/recommend/engine";

// POST /api/movies/recommend/history — body HistoryRequest. Records a
// 'dismissed' row: the item is held back for 90 days (re-admitted last).
export async function POST(request: NextRequest) {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;
  try {
    const body = await request.json().catch(() => null);
    const req = parseHistoryRequest(body);
    if (!req) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    recordHistory(guard.user.id, req);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Recommend history error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

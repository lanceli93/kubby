import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { getFilterOptionsBody } from "@/lib/filter-options";

// GET /api/filters?libraryId=xxx (libraryId optional)
// → { genres, tags, years, genreCounts, tagCounts } — counts = movies carrying each
export async function GET(request: NextRequest) {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;
  try {
    const libraryId = new URL(request.url).searchParams.get("libraryId");
    return new NextResponse(getFilterOptionsBody(libraryId), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Filters error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

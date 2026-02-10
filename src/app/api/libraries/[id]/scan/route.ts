import { NextRequest, NextResponse } from "next/server";
import { scanLibrary } from "@/lib/scanner";

// POST /api/libraries/[id]/scan
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await scanLibrary(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan failed" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getActiveScans } from "@/lib/scan-state";

// GET /api/scan-status — returns all active/recent scans
export async function GET() {
  return NextResponse.json(getActiveScans());
}

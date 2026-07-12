import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tvEpisodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getKeyframeIndex } from "@/lib/transcode/keyframe-index";

// GET /api/tv/episodes/[id]/keyframes — keyframe timestamps (seconds) of the
// source file, used by the client to snap direct-play seeks to keyframes.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const episode = db.select().from(tvEpisodes).where(eq(tvEpisodes.id, id)).get();
  if (!episode) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = episode.filePath;
  if (!filePath) {
    return NextResponse.json({ error: "No file" }, { status: 404 });
  }

  const keyframes = await getKeyframeIndex(filePath);
  return NextResponse.json({ keyframes: keyframes ?? [] });
}

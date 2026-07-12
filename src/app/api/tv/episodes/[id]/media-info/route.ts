import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import { db } from "@/lib/db";
import { tvEpisodes, tvMediaStreams } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const episode = db.select().from(tvEpisodes).where(eq(tvEpisodes.id, id)).get();
    if (!episode) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const streams = db
      .select()
      .from(tvMediaStreams)
      .where(eq(tvMediaStreams.episodeId, id))
      .orderBy(asc(tvMediaStreams.streamIndex))
      .all();

    // Episodes are single-file — no disc concept.
    return NextResponse.json({
      fileName: nodePath.basename(episode.filePath),
      filePath: episode.filePath,
      container: episode.container,
      fileSize: episode.fileSize,
      totalBitrate: episode.totalBitrate,
      formatName: episode.formatName,
      durationSeconds: episode.runtimeSeconds,
      discCount: 1,
      streams,
      discs: [],
    });
  } catch (error) {
    console.error("Get media info error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

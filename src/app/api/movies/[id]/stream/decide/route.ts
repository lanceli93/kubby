import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies, movieDiscs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decidePlayback } from "@/lib/transcode/playback-decider";
import { getTranscodeManager } from "@/lib/transcode/transcode-manager";

// GET /api/movies/[id]/stream/decide?disc=1
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const movie = db.select().from(movies).where(eq(movies.id, id)).get();
  if (!movie) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const discParam = request.nextUrl.searchParams.get("disc");
  const discNumber = discParam ? parseInt(discParam, 10) : 1;

  // Get codec info for the specific disc
  let container = movie.container;
  let videoCodec = movie.videoCodec;
  let audioCodec = movie.audioCodec;
  let filePath = movie.filePath;
  let durationSeconds = movie.runtimeSeconds;

  if (discNumber > 1) {
    const disc = db
      .select()
      .from(movieDiscs)
      .where(and(eq(movieDiscs.movieId, id), eq(movieDiscs.discNumber, discNumber)))
      .get();
    if (disc) {
      container = disc.container;
      videoCodec = disc.videoCodec;
      audioCodec = disc.audioCodec;
      filePath = disc.filePath;
      durationSeconds = disc.runtimeSeconds;
    }
  }

  const decision = decidePlayback({ container, videoCodec, audioCodec });

  // Direct play — no transcode needed
  if (decision.mode === "direct") {
    const directUrl = discNumber > 1
      ? `/api/movies/${id}/stream?disc=${discNumber}`
      : `/api/movies/${id}/stream`;
    return NextResponse.json({ mode: "direct", directUrl, durationSeconds });
  }

  // Need HLS — check if FFmpeg is available
  const manager = getTranscodeManager();
  if (!manager.checkFfmpegAvailable()) {
    // Fallback to direct play with warning
    const directUrl = discNumber > 1
      ? `/api/movies/${id}/stream?disc=${discNumber}`
      : `/api/movies/${id}/stream`;
    return NextResponse.json({
      mode: "direct",
      directUrl,
      durationSeconds,
      warning: "FFmpeg not available. Video may not play correctly in this format.",
    });
  }

  // Start transcode session
  const sessionId = manager.startSession(id, discNumber, filePath, decision);
  const hlsUrl = `/api/stream/${sessionId}/playlist.m3u8`;

  return NextResponse.json({
    mode: decision.mode,
    sessionId,
    hlsUrl,
    durationSeconds,
  });
}

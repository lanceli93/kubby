import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies, movieDiscs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decidePlayback } from "@/lib/transcode/playback-decider";
import { getTranscodeManager } from "@/lib/transcode/transcode-manager";
import { detectBestEncoder } from "@/lib/transcode/hw-accel";

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
  const startAtParam = request.nextUrl.searchParams.get("startAt");
  const startAt = startAtParam ? Math.max(0, parseInt(startAtParam, 10) || 0) : 0;
  const maxWidthParam = request.nextUrl.searchParams.get("maxWidth");
  let maxWidth = maxWidthParam ? parseInt(maxWidthParam, 10) || undefined : undefined;

  // Get codec info for the specific disc
  let container = movie.container;
  let videoCodec = movie.videoCodec;
  let audioCodec = movie.audioCodec;
  let filePath = movie.filePath;
  let durationSeconds = movie.runtimeSeconds;
  let videoWidth = movie.videoWidth;

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
      videoWidth = disc.videoWidth;
    }
  }

  const noDirectHevc = request.nextUrl.searchParams.get("noHevc") === "1";
  const decision = decidePlayback({ container, videoCodec, audioCodec });

  // iOS-specific overrides (noHevc flag doubles as iOS indicator)
  if (decision.mode === "direct" && noDirectHevc) {
    const isHevc = videoCodec && /^(hevc|h265)$/i.test(videoCodec);
    const isOversize = (videoWidth ?? 0) > 4096;

    if (isHevc) {
      // HEVC MP4 can't direct-play on iOS, but native HLS handles HEVC fine
      decision.mode = "remux";
      decision.videoAction = "copy";
      decision.audioAction = audioCodec ? "copy" : "none";
    } else if (isOversize) {
      // H.264 above 4K exceeds iOS hardware decode limit — must transcode down
      decision.mode = "transcode";
      decision.videoAction = "transcode";
      decision.audioAction = audioCodec ? "copy" : "none";
      if (!maxWidth) maxWidth = 2560; // default to 2.5K for mobile
    }
  }

  console.log(`[decide] ${movie.title} | container=${container} video=${videoCodec} audio=${audioCodec} | ${videoWidth}x${movie.videoHeight} | noHevc=${noDirectHevc} | decision=${decision.mode} (v:${decision.videoAction} a:${decision.audioAction})`);

  // Include codec debug info in response
  const debugInfo = { container, videoCodec, audioCodec, videoWidth, videoHeight: movie.videoHeight };

  if (decision.mode === "direct") {
    const directUrl = discNumber > 1
      ? `/api/movies/${id}/stream?disc=${discNumber}`
      : `/api/movies/${id}/stream`;
    return NextResponse.json({ mode: "direct", directUrl, durationSeconds, videoWidth, debug: debugInfo });
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

  // Start transcode session (with optional initial seek position)
  const sessionId = manager.startSession(id, discNumber, filePath, decision, startAt, maxWidth, videoCodec, videoWidth);
  const hlsUrl = `/api/stream/${sessionId}/playlist.m3u8`;
  // Read encoder name directly (avoids stale globalThis singleton in dev)
  const encoder = manager.getEncoderConfig?.()?.name ?? detectBestEncoder().name;

  return NextResponse.json({
    mode: decision.mode,
    sessionId,
    hlsUrl,
    durationSeconds,
    encoder,
    maxWidth: maxWidth ?? 0,
    videoWidth,
    videoCodec,
    debug: debugInfo,
  });
}

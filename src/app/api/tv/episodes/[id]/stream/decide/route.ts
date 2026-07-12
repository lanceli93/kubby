import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tvEpisodes, tvMediaStreams } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { decidePlayback } from "@/lib/transcode/playback-decider";
import { getTranscodeManager } from "@/lib/transcode/transcode-manager";
import { detectBestEncoder } from "@/lib/transcode/hw-accel";

// GET /api/tv/episodes/[id]/stream/decide
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const episode = db.select().from(tvEpisodes).where(eq(tvEpisodes.id, id)).get();
  if (!episode) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const startAtParam = request.nextUrl.searchParams.get("startAt");
  const startAt = startAtParam ? Math.max(0, parseInt(startAtParam, 10) || 0) : 0;
  const maxWidthParam = request.nextUrl.searchParams.get("maxWidth");
  let maxWidth = maxWidthParam ? parseInt(maxWidthParam, 10) || undefined : undefined;

  // Episodes are single-file — codec info comes straight from the episode row
  const container = episode.container;
  const videoCodec = episode.videoCodec;
  const audioCodec = episode.audioCodec;
  const filePath = episode.filePath;
  const durationSeconds = episode.runtimeSeconds;
  const videoWidth = episode.videoWidth;

  const noDirectHevc = request.nextUrl.searchParams.get("noHevc") === "1";
  const decision = decidePlayback({ container, videoCodec, audioCodec });

  // iOS-specific overrides (noHevc flag doubles as iOS indicator)
  // Look up HEVC stream details from DB for iOS compatibility checks
  let videoProfile: string | null = null;
  let videoBitDepth: number | null = null;
  let videoPixFmt: string | null = null;
  let videoLevel: number | null = null;
  let hasBFrames: number | null = null;
  const isHevc = !!videoCodec && /^(hevc|h265)$/i.test(videoCodec);

  if (noDirectHevc && isHevc) {
    const videoStream = db.select({
      profile: tvMediaStreams.profile, bitDepth: tvMediaStreams.bitDepth,
      pixFmt: tvMediaStreams.pixFmt, level: tvMediaStreams.level, hasBFrames: tvMediaStreams.hasBFrames,
    }).from(tvMediaStreams)
      .where(and(eq(tvMediaStreams.episodeId, id), eq(tvMediaStreams.streamType, "video")))
      .get();
    videoProfile = videoStream?.profile ?? null;
    videoBitDepth = videoStream?.bitDepth ?? null;
    videoPixFmt = videoStream?.pixFmt ?? null;
    videoLevel = videoStream?.level ?? null;
    hasBFrames = videoStream?.hasBFrames ?? null;
  }

  // iOS HEVC compatibility checks:
  // 1. Profile must be Main / Main 10 / Main Still Picture
  // 2. has_b_frames >= 2 causes iOS HLS fMP4 decode failures (composition time offset issues)
  const IOS_HEVC_SAFE_PROFILES = new Set(["main", "main 10", "main still picture"]);
  const hevcProfileUnsupported = isHevc && videoProfile && !IOS_HEVC_SAFE_PROFILES.has(videoProfile.toLowerCase());
  const hevcBFrameUnsafe = isHevc && hasBFrames !== null && hasBFrames >= 2;

  if (decision.mode === "direct" && noDirectHevc) {
    const isOversize = (videoWidth ?? 0) > 4096;

    if (isHevc && (hevcProfileUnsupported || hevcBFrameUnsafe)) {
      // HEVC with unsupported profile or high B-frame count — must transcode
      decision.mode = "transcode";
      decision.videoAction = "transcode";
      decision.audioAction = audioCodec ? "copy" : "none";
      if (!maxWidth) maxWidth = 2560;
    } else if (isHevc) {
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

  // Also catch remux HEVC with issues (non-MP4 containers like MKV)
  if (decision.mode === "remux" && noDirectHevc && (hevcProfileUnsupported || hevcBFrameUnsafe)) {
    decision.mode = "transcode";
    decision.videoAction = "transcode";
    if (!maxWidth) maxWidth = 2560;
  }

  console.log(`[decide] episode ${id} | container=${container} video=${videoCodec} audio=${audioCodec} profile=${videoProfile} pixFmt=${videoPixFmt} level=${videoLevel} bitDepth=${videoBitDepth} hasBFrames=${hasBFrames} | ${videoWidth}x${episode.videoHeight} | noHevc=${noDirectHevc} | decision=${decision.mode} (v:${decision.videoAction} a:${decision.audioAction})`);

  // Include codec debug info in response
  const debugInfo = { container, videoCodec, audioCodec, videoWidth, videoHeight: episode.videoHeight };

  if (decision.mode === "direct") {
    const directUrl = `/api/tv/episodes/${id}/stream`;
    return NextResponse.json({ mode: "direct", directUrl, durationSeconds, videoWidth, debug: debugInfo });
  }

  // Need HLS — check if FFmpeg is available
  const manager = getTranscodeManager();
  if (!manager.checkFfmpegAvailable()) {
    // Fallback to direct play with warning
    const directUrl = `/api/tv/episodes/${id}/stream`;
    return NextResponse.json({
      mode: "direct",
      directUrl,
      durationSeconds,
      warning: "FFmpeg not available. Video may not play correctly in this format.",
    });
  }

  // Start transcode session (with optional initial seek position)
  // Remux = stream copy, scaling not possible — ignore maxWidth
  const effectiveMaxWidth = decision.mode === "remux" ? undefined : maxWidth;
  const sessionId = manager.startSession(id, 1, filePath, decision, startAt, effectiveMaxWidth, videoCodec, videoWidth);
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

import { NextRequest, NextResponse } from "next/server";
import { execFile, execFileSync } from "child_process";
import { db } from "@/lib/db";
import { movies, movieDiscs, mediaStreams } from "@/lib/db/schema";
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
  // Probe HEVC video stream for detailed codec parameters
  let videoProfile: string | null = null;
  let videoBitDepth: number | null = null;
  let videoPixFmt: string | null = null;
  let videoLevel: number | null = null;
  let hasBFrames: number | null = null;
  const isHevc = !!videoCodec && /^(hevc|h265)$/i.test(videoCodec);

  if (noDirectHevc && isHevc) {
    // Live ffprobe for has_b_frames (not stored in DB) + other diagnostics
    try {
      const ffprobePath = process.env.FFPROBE_PATH || "ffprobe";
      const stdout = execFileSync(ffprobePath,
        ["-v", "quiet", "-print_format", "json", "-select_streams", "v:0", "-show_streams", filePath],
        { timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
      ).toString();
      const vs = JSON.parse(stdout).streams?.[0];
      if (vs) {
        videoProfile = vs.profile && vs.profile !== "unknown" ? vs.profile : null;
        videoBitDepth = vs.bits_per_raw_sample ? parseInt(vs.bits_per_raw_sample, 10) : null;
        videoPixFmt = vs.pix_fmt ?? null;
        videoLevel = typeof vs.level === "number" ? vs.level : null;
        hasBFrames = typeof vs.has_b_frames === "number" ? vs.has_b_frames : null;
        console.log(`[decide:probe] ${movie.title} | codec_tag=${vs.codec_tag_string} color_space=${vs.color_space} color_transfer=${vs.color_transfer} color_primaries=${vs.color_primaries} color_range=${vs.color_range} has_b_frames=${vs.has_b_frames} refs=${vs.refs} pix_fmt=${vs.pix_fmt} level=${vs.level} profile=${vs.profile} bitrate=${vs.bit_rate} r_frame_rate=${vs.r_frame_rate}`);
      }
    } catch { /* ffprobe failed — fall back to DB values */ }

    // Fallback to DB if ffprobe didn't run
    if (videoProfile === null) {
      const videoStream = db.select({ profile: mediaStreams.profile, bitDepth: mediaStreams.bitDepth, pixFmt: mediaStreams.pixFmt, level: mediaStreams.level })
        .from(mediaStreams)
        .where(and(eq(mediaStreams.movieId, id), eq(mediaStreams.streamType, "video"), eq(mediaStreams.discNumber, discNumber)))
        .get();
      videoProfile = videoStream?.profile ?? null;
      videoBitDepth = videoStream?.bitDepth ?? null;
      videoPixFmt = videoStream?.pixFmt ?? null;
      videoLevel = videoStream?.level ?? null;
    }
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

  console.log(`[decide] ${movie.title} | container=${container} video=${videoCodec} audio=${audioCodec} profile=${videoProfile} pixFmt=${videoPixFmt} level=${videoLevel} bitDepth=${videoBitDepth} hasBFrames=${hasBFrames} | ${videoWidth}x${movie.videoHeight} | noHevc=${noDirectHevc} | decision=${decision.mode} (v:${decision.videoAction} a:${decision.audioAction})`);

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
  // Remux = stream copy, scaling not possible — ignore maxWidth
  const effectiveMaxWidth = decision.mode === "remux" ? undefined : maxWidth;
  const sessionId = manager.startSession(id, discNumber, filePath, decision, startAt, effectiveMaxWidth, videoCodec, videoWidth);
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

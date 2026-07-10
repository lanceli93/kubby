import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { photoItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decidePlayback } from "@/lib/transcode/playback-decider";
import { getTranscodeManager } from "@/lib/transcode/transcode-manager";

// GET /api/photos/[id]/stream/decide?noHevc=1
// Video playback decision for photo-domain items. Mirrors
// /api/movies/[id]/stream/decide but queries photo_items and skips the
// mediaStreams profile/B-frame checks — photo_items has no stream-level
// data, and phone-shot HEVC defaults to Main profile, so it's acceptable.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const item = db.select().from(photoItems).where(eq(photoItems.id, id)).get();
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!item.isVideo) {
    return NextResponse.json({ error: "Not a video item" }, { status: 400 });
  }

  const { container, videoCodec, audioCodec, durationSeconds } = item;
  const noDirectHevc = request.nextUrl.searchParams.get("noHevc") === "1";
  const decision = decidePlayback({ container, videoCodec, audioCodec });

  const isHevc = !!videoCodec && /^(hevc|h265)$/i.test(videoCodec);

  // iOS-specific override: HEVC MP4 can't direct-play on iOS Safari, but
  // native HLS handles HEVC fine — remux (stream copy) instead of direct.
  if (decision.mode === "direct" && noDirectHevc && isHevc) {
    decision.mode = "remux";
    decision.videoAction = "copy";
    decision.audioAction = audioCodec ? "copy" : "none";
  }

  console.log(`[photos:decide] ${id} | container=${container} video=${videoCodec} audio=${audioCodec} | noHevc=${noDirectHevc} | decision=${decision.mode} (v:${decision.videoAction} a:${decision.audioAction})`);

  if (decision.mode === "direct") {
    return NextResponse.json({
      mode: "direct",
      directUrl: `/api/photos/${id}/file`,
      durationSeconds,
    });
  }

  // Need HLS — check if FFmpeg is available
  const manager = getTranscodeManager();
  if (!manager.checkFfmpegAvailable()) {
    return NextResponse.json({
      mode: "direct",
      directUrl: `/api/photos/${id}/file`,
      durationSeconds,
      warning: "FFmpeg not available. Video may not play correctly in this format.",
    });
  }

  // startSession's first arg is only used as a session-grouping key (it never
  // queries the movies table), so passing the photo id is safe here.
  const sessionId = manager.startSession(id, 1, item.filePath, decision, 0, undefined, videoCodec, item.width);
  const hlsUrl = `/api/stream/${sessionId}/playlist.m3u8`;

  return NextResponse.json({
    mode: decision.mode,
    sessionId,
    hlsUrl,
    durationSeconds,
  });
}

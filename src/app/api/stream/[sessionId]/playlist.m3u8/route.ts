import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { getTranscodeManager } from "@/lib/transcode/transcode-manager";

// GET /api/stream/[sessionId]/playlist.m3u8
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const manager = getTranscodeManager();
  const session = manager.getSession(sessionId);

  if (!session) {
    return new Response("Session not found", { status: 404 });
  }

  // Wait for FFmpeg to generate the playlist
  const ready = await manager.waitForPlaylist(sessionId, 15000);
  if (!ready) {
    return new Response("Playlist not ready (timeout)", { status: 504 });
  }

  const playlistPath = path.join(session.outputDir, "playlist.m3u8");
  let content = fs.readFileSync(playlistPath, "utf-8");

  // Rewrite segment paths to route through our API (supports .ts and .m4s/.mp4 fMP4 segments)
  content = content.replace(
    /^((?:segment_\d{4}\.(?:ts|m4s))|(?:init\.mp4))$/gm,
    `/api/stream/${sessionId}/segment/$1`,
  );

  return new Response(content, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

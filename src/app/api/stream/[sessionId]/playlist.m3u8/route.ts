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
  const rawContent = fs.readFileSync(playlistPath, "utf-8");

  // Log raw playlist from FFmpeg (first request only, to avoid spam)
  if (!session.playlistLogged) {
    const lines = rawContent.split("\n").slice(0, 20).join("\n");
    console.log(`[playlist:${sessionId.slice(0, 8)}] raw (first 20 lines):\n${lines}`);

    // Log files in output dir
    try {
      const files = fs.readdirSync(session.outputDir);
      console.log(`[playlist:${sessionId.slice(0, 8)}] files: ${files.join(", ")}`);
    } catch { /* ignore */ }

    session.playlistLogged = true;
  }

  // Rewrite segment paths to route through our API
  let content = rawContent;
  const segBase = `/api/stream/${sessionId}/segment`;
  // 1. Standalone segment lines: segment_0000.ts or segment_0000.m4s
  content = content.replace(
    /^(segment_\d{4}\.(?:ts|m4s))$/gm,
    `${segBase}/$1`,
  );
  // 2. fMP4 init segment in EXT-X-MAP tag: URI="init.mp4"
  content = content.replace(
    /URI="(init\.mp4)"/g,
    `URI="${segBase}/$1"`,
  );

  console.log(`[playlist:${sessionId.slice(0, 8)}] rewritten (first 10 lines):\n${content.split("\n").slice(0, 10).join("\n")}`);

  return new Response(content, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

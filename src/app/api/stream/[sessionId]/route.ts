import { NextRequest, NextResponse } from "next/server";
import { getTranscodeManager } from "@/lib/transcode/transcode-manager";

// PATCH /api/stream/[sessionId] — heartbeat to keep session alive
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const manager = getTranscodeManager();
  const session = manager.getSession(sessionId); // updates lastAccessedAt
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE /api/stream/[sessionId] — stop session, cleanup
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const manager = getTranscodeManager();
  await manager.stopSession(sessionId);
  return NextResponse.json({ ok: true });
}

// POST /api/stream/[sessionId] — seek to new position
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await request.json();

  if (body.action !== "seek" || typeof body.seekToSeconds !== "number") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const manager = getTranscodeManager();
  const newSessionId = await manager.seekSession(sessionId, body.seekToSeconds);

  if (!newSessionId) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Wait for new playlist to be ready
  await manager.waitForPlaylist(newSessionId, 15000);

  return NextResponse.json({
    sessionId: newSessionId,
    hlsUrl: `/api/stream/${newSessionId}/playlist.m3u8`,
  });
}

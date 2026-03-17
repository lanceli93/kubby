import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { getTranscodeManager } from "@/lib/transcode/transcode-manager";

const SEGMENT_PATTERN = /^(segment_\d{4}\.(ts|m4s)|init\.mp4)$/;

// GET /api/stream/[sessionId]/segment/[name]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; name: string }> }
) {
  const { sessionId, name } = await params;

  // Validate segment name to prevent path traversal
  if (!SEGMENT_PATTERN.test(name)) {
    console.log(`[segment] REJECTED invalid name: ${name}`);
    return new Response("Invalid segment name", { status: 400 });
  }

  const manager = getTranscodeManager();
  const session = manager.getSession(sessionId);

  if (!session) {
    console.log(`[segment] Session not found: ${sessionId.slice(0, 8)} for ${name}`);
    return new Response("Session not found", { status: 404 });
  }

  const segmentPath = path.join(session.outputDir, name);

  // Brief wait+retry if segment not yet generated
  let attempts = 0;
  while (!fs.existsSync(segmentPath) && attempts < 20) {
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }

  if (!fs.existsSync(segmentPath)) {
    console.log(`[segment] NOT FOUND after ${attempts} attempts: ${name}`);
    return new Response("Segment not found", { status: 404 });
  }

  const data = fs.readFileSync(segmentPath);
  const ext = path.extname(name);
  const contentType = ext === ".m4s" || ext === ".mp4" ? "video/mp4" : "video/mp2t";
  console.log(`[segment] ${sessionId.slice(0, 8)}/${name} → ${contentType} (${data.length} bytes)`);
  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Content-Length": String(data.length),
    },
  });
}

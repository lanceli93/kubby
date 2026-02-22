import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
};

// GET /api/images/[...path] - Serve local image files via streaming
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const imagePath = decodeURIComponent(pathSegments.join("/"));

  // Security: prevent path traversal
  const normalizedPath = path.normalize(imagePath);
  if (normalizedPath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const stat = await fs.promises.stat(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    // Stream the file instead of reading it entirely into memory
    const nodeStream = fs.createReadStream(imagePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Image serve error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

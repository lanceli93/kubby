import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
};

// GET /api/images/[...path] - Serve local image files
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

  if (!fs.existsSync(imagePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const ext = path.extname(imagePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = fs.readFileSync(imagePath);

    // Use ETag + must-revalidate so browsers can cache but always check for
    // updates. This fixes stale images when files are replaced on disk (e.g.
    // Edit Images dialog).  A "?v=timestamp" param from the client also works
    // as an instant cache-bust, but the ETag ensures correctness even without it.
    const stat = fs.statSync(imagePath);
    const etag = `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;

    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=0, must-revalidate",
        "ETag": etag,
      },
    });
  } catch (error) {
    console.error("Image serve error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

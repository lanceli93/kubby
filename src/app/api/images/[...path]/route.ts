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

let sharpModule: typeof import("sharp") | null = null;
async function getSharp() {
  if (sharpModule) return sharpModule;
  try {
    sharpModule = (await import("sharp")).default;
    return sharpModule;
  } catch {
    return null;
  }
}

// GET /api/images/[...path] - Serve local image files with optional resize
// Query params: ?w=WIDTH (resize width) &q=QUALITY (1-100, default 80)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const imagePath = decodeURIComponent(pathSegments.join("/"));

  // Security: prevent path traversal
  const normalizedPath = path.normalize(imagePath);
  if (normalizedPath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const { searchParams } = request.nextUrl;
  const requestedWidth = parseInt(searchParams.get("w") || "0", 10);
  const quality = parseInt(searchParams.get("q") || "80", 10);

  try {
    const data = await fs.promises.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();

    // If width requested and sharp available, resize + convert to WebP
    if (requestedWidth > 0) {
      const sharp = await getSharp();
      if (sharp) {
        const optimized = await sharp(data)
          .resize(requestedWidth, undefined, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: Math.min(Math.max(quality, 1), 100) })
          .toBuffer();

        return new Response(optimized, {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    // Fallback: serve original file
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
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

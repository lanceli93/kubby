import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { db } from "@/lib/db";
import { photoItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveDataPath } from "@/lib/paths";

const VIDEO_MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".3gp": "video/3gpp",
};

function contentDispositionAttachment(fileName: string): string {
  // RFC 5987 filename* form so non-ASCII (e.g. Chinese) file names survive.
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function readableFromFile(filePath: string, range?: { start: number; end: number }): ReadableStream {
  const stream = range
    ? fs.createReadStream(filePath, { start: range.start, end: range.end })
    : fs.createReadStream(filePath);
  return Readable.toWeb(stream) as ReadableStream;
}

// GET /api/photos/[id]/file?original=1
// Images: default serves previewPath (HEIC etc.) if present, else the original;
//   ?original=1 always serves the original file as a download attachment.
// Videos: always serves the original file, with Range support (lightbox direct playback).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const item = db.select().from(photoItems).where(eq(photoItems.id, id)).get();
    if (!item) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const original = request.nextUrl.searchParams.get("original") === "1";

    if (item.isVideo) {
      if (!fs.existsSync(item.filePath)) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      const stat = fs.statSync(item.filePath);
      const fileSize = stat.size;
      const ext = path.extname(item.filePath).toLowerCase();
      const contentType = item.mimeType || VIDEO_MIME_BY_EXT[ext] || "video/mp4";

      const headers: Record<string, string> = { "Content-Type": contentType, "Accept-Ranges": "bytes" };
      if (original) {
        headers["Content-Disposition"] = contentDispositionAttachment(item.fileName);
      }

      const range = request.headers.get("range");
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = Math.min(parseInt(parts[0], 10) || 0, fileSize - 1);
        const end = parts[1] ? Math.min(parseInt(parts[1], 10), fileSize - 1) : fileSize - 1;

        if (start > end) {
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${fileSize}` },
          });
        }

        const chunkSize = end - start + 1;
        return new Response(readableFromFile(item.filePath, { start, end }), {
          status: 206,
          headers: {
            ...headers,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": String(chunkSize),
          },
        });
      }

      return new Response(readableFromFile(item.filePath), {
        headers: { ...headers, "Content-Length": String(fileSize) },
      });
    }

    // Images
    if (original) {
      if (!fs.existsSync(item.filePath)) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      const stat = fs.statSync(item.filePath);
      const contentType = item.mimeType || "application/octet-stream";
      return new Response(readableFromFile(item.filePath), {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(stat.size),
          "Content-Disposition": contentDispositionAttachment(item.fileName),
        },
      });
    }

    // Default: prefer the browser-renderable preview (HEIC/HEIF etc.), else original.
    if (item.previewPath) {
      const previewFullPath = resolveDataPath(item.previewPath);
      if (!fs.existsSync(previewFullPath)) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      const stat = fs.statSync(previewFullPath);
      return new Response(readableFromFile(previewFullPath), {
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": String(stat.size),
        },
      });
    }

    if (!fs.existsSync(item.filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const stat = fs.statSync(item.filePath);
    const contentType = item.mimeType || "application/octet-stream";
    return new Response(readableFromFile(item.filePath), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
      },
    });
  } catch (error) {
    console.error("Photo file error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

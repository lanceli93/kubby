import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies, movieDiscs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";

// GET /api/movies/[id]/stream - Video file serving with Range Requests
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const movie = db.select().from(movies).where(eq(movies.id, id)).get();
    if (!movie) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Support ?disc=N for multi-disc movies
    const discParam = request.nextUrl.searchParams.get("disc");
    const discNumber = discParam ? parseInt(discParam, 10) : 1;
    let filePath = movie.filePath;
    if (discNumber > 1) {
      const disc = db
        .select()
        .from(movieDiscs)
        .where(and(eq(movieDiscs.movieId, id), eq(movieDiscs.discNumber, discNumber)))
        .get();
      if (disc) {
        filePath = disc.filePath;
      }
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      ".mp4": "video/mp4",
      ".mkv": "video/x-matroska",
      ".avi": "video/x-msvideo",
      ".wmv": "video/x-ms-wmv",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".m4v": "video/mp4",
    };
    const contentType = mimeTypes[ext] || "video/mp4";

    const range = request.headers.get("range");
    const ua = request.headers.get("user-agent") || "";
    console.log(`[stream] ${id} | Range: ${range || "none"} | UA: ${ua} | Size: ${fileSize}`);

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

      const stream = fs.createReadStream(filePath, { start, end });
      const readable = new ReadableStream({
        start(controller) {
          let closed = false;
          stream.on("data", (chunk) => {
            if (!closed) {
              try { controller.enqueue(chunk); } catch { closed = true; }
            }
          });
          stream.on("end", () => {
            if (!closed) {
              closed = true;
              try { controller.close(); } catch { /* already closed */ }
            }
          });
          stream.on("error", (err) => {
            if (!closed) {
              closed = true;
              try { controller.error(err); } catch { /* already closed */ }
            }
          });
        },
        cancel() {
          stream.destroy();
        },
      });

      return new Response(readable, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
        },
      });
    }

    // No range - serve entire file
    const stream = fs.createReadStream(filePath);
    const readable = new ReadableStream({
      start(controller) {
        let closed = false;
        stream.on("data", (chunk) => {
          if (!closed) {
            try { controller.enqueue(chunk); } catch { closed = true; }
          }
        });
        stream.on("end", () => {
          if (!closed) {
            closed = true;
            try { controller.close(); } catch { /* already closed */ }
          }
        });
        stream.on("error", (err) => {
          if (!closed) {
            closed = true;
            try { controller.error(err); } catch { /* already closed */ }
          }
        });
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Length": String(fileSize),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("Stream error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

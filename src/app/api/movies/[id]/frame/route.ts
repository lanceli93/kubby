import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { db } from "@/lib/db";
import { movies, movieDiscs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getFfmpegPath } from "@/lib/paths";
import fs from "fs";

// GET /api/movies/[id]/frame?t=SECONDS&disc=N&maxWidth=W
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

    // Resolve disc file path (same pattern as stream/route.ts)
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

    // Parse and clamp timestamp
    const tParam = request.nextUrl.searchParams.get("t");
    let t = tParam ? parseFloat(tParam) : 0;
    const runtimeSeconds = movie.runtimeSeconds || 0;
    if (runtimeSeconds > 0) {
      t = Math.max(0, Math.min(t, runtimeSeconds));
    } else {
      t = Math.max(0, t);
    }

    // Parse and clamp maxWidth
    const maxWidthParam = request.nextUrl.searchParams.get("maxWidth");
    let maxWidth = maxWidthParam ? parseInt(maxWidthParam, 10) : 960;
    maxWidth = Math.max(320, Math.min(maxWidth, 3840));

    const args = [
      "-ss", String(t),
      "-i", filePath,
      "-vframes", "1",
      "-vf", `scale='min(${maxWidth},iw)':-2`,
      "-f", "image2",
      "-q:v", "2",
      "pipe:1",
    ];

    const frameData = await new Promise<Buffer>((resolve, reject) => {
      const proc = spawn(getFfmpegPath(), args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      const chunks: Buffer[] = [];
      let stderr = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // 10s safety timeout
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("Frame extraction timed out"));
      }, 10000);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    return new Response(new Uint8Array(frameData), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(frameData.length),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Frame extraction error:", error);
    return NextResponse.json({ error: "Frame extraction failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { db } from "@/lib/db";
import { musicTracks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getFfmpegPath } from "@/lib/paths";
import { decideAudioPlayback } from "@/lib/music/audio-decider";

// Content-Type for browser-native audio, keyed by lowercased extension.
const AUDIO_MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
};

function readableFromFile(filePath: string, range?: { start: number; end: number }): ReadableStream {
  const stream = range
    ? fs.createReadStream(filePath, { start: range.start, end: range.end })
    : fs.createReadStream(filePath);
  return Readable.toWeb(stream) as ReadableStream;
}

// GET /api/music/tracks/[id]/stream
// Direct mode: serves the original audio file with HTTP 206 Range support so
//   <audio> seeking works for browser-native codecs (mp3/aac/flac/ogg/opus/wav).
// Transcode mode: pipes the file through ffmpeg to mp3 for non-native formats
//   (wma/aiff/alac/ape/dsf...). No Range — the stream is not byte-seekable.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const track = db.select().from(musicTracks).where(eq(musicTracks.id, id)).get();
    if (!track) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!fs.existsSync(track.filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(track.filePath).toLowerCase();
    const mode = decideAudioPlayback({ codec: track.codec, ext });

    // ─── Transcode mode: ffmpeg → mp3 pipe (no Range) ───────────────────────
    if (mode === "transcode") {
      let child;
      try {
        child = spawn(getFfmpegPath(), [
          "-i", track.filePath,
          "-f", "mp3",
          "-ab", "192k",
          "-map_metadata", "-1",
          "pipe:1",
        ], { stdio: ["ignore", "pipe", "pipe"] });
      } catch (spawnError) {
        console.error("Music stream: ffmpeg spawn failed:", spawnError);
        return NextResponse.json({ error: "Transcode unavailable" }, { status: 500 });
      }

      // Surface a spawn failure that arrives asynchronously (e.g. ENOENT).
      child.on("error", (err) => {
        console.error("Music stream: ffmpeg process error:", err);
      });

      // Drain stderr (avoids backpressure) and keep a tail for diagnostics.
      let stderrTail = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-1000);
      });
      child.on("close", (code) => {
        if (code && code !== 0) {
          console.error(`Music stream: ffmpeg exited with code ${code}: ${stderrTail.slice(-500)}`);
        }
      });

      // Kill ffmpeg if the client aborts the request.
      request.signal.addEventListener("abort", () => {
        child.kill("SIGKILL");
      });

      const webStream = Readable.toWeb(child.stdout) as ReadableStream;
      return new Response(webStream, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        },
      });
    }

    // ─── Direct mode: original file with Range support ──────────────────────
    const stat = fs.statSync(track.filePath);
    const fileSize = stat.size;
    const contentType = AUDIO_MIME_BY_EXT[ext] || track.mimeType || "audio/mpeg";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    };

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
      return new Response(readableFromFile(track.filePath, { start, end }), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Content-Length": String(chunkSize),
        },
      });
    }

    return new Response(readableFromFile(track.filePath), {
      headers: { ...headers, "Content-Length": String(fileSize) },
    });
  } catch (error) {
    console.error("Music stream error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import { db } from "@/lib/db";
import { movies, mediaStreams, movieDiscs } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const movie = db.select().from(movies).where(eq(movies.id, id)).get();
    if (!movie) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const streams = db
      .select()
      .from(mediaStreams)
      .where(eq(mediaStreams.movieId, id))
      .orderBy(asc(mediaStreams.streamIndex))
      .all();

    // Include disc info for multi-disc movies
    const discs = movie.discCount && movie.discCount > 1
      ? db
          .select()
          .from(movieDiscs)
          .where(eq(movieDiscs.movieId, id))
          .orderBy(asc(movieDiscs.discNumber))
          .all()
      : [];

    return NextResponse.json({
      fileName: nodePath.basename(movie.filePath),
      filePath: movie.filePath,
      container: movie.container,
      fileSize: movie.fileSize,
      totalBitrate: movie.totalBitrate,
      formatName: movie.formatName,
      durationSeconds: movie.runtimeSeconds,
      discCount: movie.discCount ?? 1,
      streams,
      discs: discs.map((d) => ({
        discNumber: d.discNumber,
        label: d.label,
        fileName: nodePath.basename(d.filePath),
        filePath: d.filePath,
        container: d.container,
        fileSize: d.fileSize,
        totalBitrate: d.totalBitrate,
        formatName: d.formatName,
        runtimeSeconds: d.runtimeSeconds,
        videoCodec: d.videoCodec,
        audioCodec: d.audioCodec,
        videoWidth: d.videoWidth,
        videoHeight: d.videoHeight,
        audioChannels: d.audioChannels,
      })),
    });
  } catch (error) {
    console.error("Get media info error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import { db } from "@/lib/db";
import { movies, mediaStreams } from "@/lib/db/schema";
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

    return NextResponse.json({
      fileName: nodePath.basename(movie.filePath),
      filePath: movie.filePath,
      container: movie.container,
      fileSize: movie.fileSize,
      totalBitrate: movie.totalBitrate,
      formatName: movie.formatName,
      durationSeconds: movie.runtimeSeconds,
      streams,
    });
  } catch (error) {
    console.error("Get media info error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

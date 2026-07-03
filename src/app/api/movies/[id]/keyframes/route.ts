import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies, movieDiscs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getKeyframeIndex } from "@/lib/transcode/keyframe-index";

// GET /api/movies/[id]/keyframes?disc=1 — keyframe timestamps (seconds) of the
// source file, used by the client to snap direct-play seeks to keyframes.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const movie = db.select().from(movies).where(eq(movies.id, id)).get();
  if (!movie) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let filePath = movie.filePath;
  const discParam = request.nextUrl.searchParams.get("disc");
  const discNumber = discParam ? parseInt(discParam, 10) : 1;
  if ((movie.discCount ?? 1) > 1) {
    const disc = db
      .select({ filePath: movieDiscs.filePath })
      .from(movieDiscs)
      .where(and(eq(movieDiscs.movieId, id), eq(movieDiscs.discNumber, discNumber)))
      .get();
    if (disc) filePath = disc.filePath;
  }

  if (!filePath) {
    return NextResponse.json({ error: "No file" }, { status: 404 });
  }

  const keyframes = await getKeyframeIndex(filePath);
  return NextResponse.json({ keyframes: keyframes ?? [] });
}

import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { db } from "@/lib/db";
import { movies, movieDiscs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/movies/[id]/media-info/raw?disc=1
// Returns raw ffprobe JSON for full field-by-field comparison
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const movie = db.select().from(movies).where(eq(movies.id, id)).get();
  if (!movie) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const discParam = request.nextUrl.searchParams.get("disc");
  const discNumber = discParam ? parseInt(discParam, 10) : 1;

  let filePath = movie.filePath;
  if (discNumber > 1) {
    const disc = db.select().from(movieDiscs)
      .where(and(eq(movieDiscs.movieId, id), eq(movieDiscs.discNumber, discNumber)))
      .get();
    if (disc) filePath = disc.filePath;
  }

  const ffprobePath = process.env.FFPROBE_PATH || "ffprobe";

  return new Promise<NextResponse>((resolve) => {
    execFile(
      ffprobePath,
      ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", filePath],
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve(NextResponse.json({ error: "ffprobe failed", message: error.message }, { status: 500 }));
          return;
        }
        try {
          const data = JSON.parse(stdout);
          resolve(NextResponse.json(data));
        } catch {
          resolve(NextResponse.json({ error: "Failed to parse ffprobe output" }, { status: 500 }));
        }
      }
    );
  });
}

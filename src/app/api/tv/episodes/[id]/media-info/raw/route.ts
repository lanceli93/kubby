import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { db } from "@/lib/db";
import { tvEpisodes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/tv/episodes/[id]/media-info/raw
// Returns raw ffprobe JSON for full field-by-field comparison
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const episode = db.select().from(tvEpisodes).where(eq(tvEpisodes.id, id)).get();
  if (!episode) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const filePath = episode.filePath;

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

import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import { db } from "@/lib/db";
import { tvEpisodes, tvShows, userEpisodeData } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

// GET /api/tv/episodes/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const episode = db.select().from(tvEpisodes).where(eq(tvEpisodes.id, id)).get();
    if (!episode) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const session = await auth();
    const userId = session?.user?.id;

    // Parent show context (folderPath is needed to resolve relative paths).
    const show = db
      .select({
        id: tvShows.id,
        title: tvShows.title,
        folderPath: tvShows.folderPath,
        posterPath: tvShows.posterPath,
        posterMtime: tvShows.posterMtime,
        posterBlur: tvShows.posterBlur,
      })
      .from(tvShows)
      .where(eq(tvShows.id, episode.showId))
      .get();

    let userData = {
      playbackPositionSeconds: 0,
      isPlayed: false,
      playCount: 0,
      personalRating: null as number | null,
      vrLayout: null as string | null,
    };
    if (userId) {
      const row = db
        .select()
        .from(userEpisodeData)
        .where(and(eq(userEpisodeData.userId, userId), eq(userEpisodeData.episodeId, id)))
        .get();
      if (row) {
        userData = {
          playbackPositionSeconds: row.playbackPositionSeconds ?? 0,
          isPlayed: row.isPlayed ?? false,
          playCount: row.playCount ?? 0,
          personalRating: row.personalRating,
          vrLayout: row.vrLayout ?? null,
        };
      }
    }

    const folderPath = show?.folderPath ?? "";
    const stillPath = episode.stillPath
      ? nodePath.join(folderPath, episode.stillPath)
      : null;
    const showPosterPath =
      show?.posterPath && folderPath
        ? nodePath.join(folderPath, show.posterPath)
        : null;

    return NextResponse.json({
      ...episode,
      stillPath: stampPath(stillPath, episode.stillMtime),
      stillBlur: episode.stillBlur,
      showId: episode.showId,
      showTitle: show?.title ?? null,
      showPosterPath: stampPath(showPosterPath, show?.posterMtime),
      seasonNumber: episode.seasonNumber,
      userData,
    });
  } catch (error) {
    console.error("Get tv episode error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tvEpisodes, tvEpisodeBookmarks } from "@/lib/db/schema";
import { and, eq, asc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/tv/[id]/bookmarks — aggregate the current user's bookmarks across
// every episode of this show, ordered by season/episode/timestamp.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: showId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // All episodes for this show (id + display metadata).
    const episodes = db
      .select({
        id: tvEpisodes.id,
        seasonNumber: tvEpisodes.seasonNumber,
        episodeNumber: tvEpisodes.episodeNumber,
        title: tvEpisodes.title,
      })
      .from(tvEpisodes)
      .where(eq(tvEpisodes.showId, showId))
      .all();

    if (episodes.length === 0) {
      return NextResponse.json([]);
    }

    const episodeMap = new Map(episodes.map((e) => [e.id, e]));
    const episodeIds = episodes.map((e) => e.id);

    const rows = db
      .select()
      .from(tvEpisodeBookmarks)
      .where(
        and(
          eq(tvEpisodeBookmarks.userId, session.user.id),
          inArray(tvEpisodeBookmarks.episodeId, episodeIds)
        )
      )
      .orderBy(asc(tvEpisodeBookmarks.timestampSeconds))
      .all();

    const result = rows
      .map((row) => {
        const ep = episodeMap.get(row.episodeId);
        return {
          id: row.id,
          episodeId: row.episodeId,
          seasonNumber: ep?.seasonNumber ?? 0,
          episodeNumber: ep?.episodeNumber ?? 0,
          episodeTitle: ep?.title ?? null,
          timestampSeconds: row.timestampSeconds,
          iconType: row.iconType,
          tags: row.tags ? JSON.parse(row.tags) : [],
          note: row.note,
          // thumbnailPath is stored as an absolute path; the client resolves it.
          thumbnailPath: row.thumbnailPath,
          thumbnailAspect: row.thumbnailAspect,
          viewState: row.viewState ? JSON.parse(row.viewState) : null,
        };
      })
      // Final ordering: season, then episode, then timestamp.
      .sort(
        (a, b) =>
          a.seasonNumber - b.seasonNumber ||
          a.episodeNumber - b.episodeNumber ||
          a.timestampSeconds - b.timestampSeconds
      );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get tv show bookmarks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

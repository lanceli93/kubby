import { v4 as uuidv4 } from "uuid";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tvEpisodes, userTvShowData } from "@/lib/db/schema";

/**
 * Bump the parent show's `user_tv_show_data.lastPlayedAt` for an episode
 * playback event, so the show surfaces (and orders) in the next-up row.
 * Upserts the show row if the user has none yet. No-op for an unknown episode.
 */
export function touchShowLastPlayed(userId: string, episodeId: string, now: string) {
  const ep = db
    .select({ showId: tvEpisodes.showId })
    .from(tvEpisodes)
    .where(eq(tvEpisodes.id, episodeId))
    .get();
  if (!ep) return;

  const existingShow = db
    .select({ id: userTvShowData.id })
    .from(userTvShowData)
    .where(and(eq(userTvShowData.userId, userId), eq(userTvShowData.showId, ep.showId)))
    .get();

  if (existingShow) {
    db.update(userTvShowData)
      .set({ lastPlayedAt: now })
      .where(eq(userTvShowData.id, existingShow.id))
      .run();
  } else {
    db.insert(userTvShowData)
      .values({
        id: uuidv4(),
        userId,
        showId: ep.showId,
        isFavorite: false,
        lastPlayedAt: now,
      })
      .run();
  }
}

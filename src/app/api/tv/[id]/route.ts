import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import fs from "fs/promises";
import { db } from "@/lib/db";
import {
  tvShows,
  tvSeasons,
  tvEpisodes,
  tvShowPeople,
  tvPeople,
  userEpisodeData,
  userTvShowData,
} from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveDataPath } from "@/lib/paths";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

// GET /api/tv/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const show = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
    if (!show) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const session = await auth();
    const userId = session?.user?.id;

    // Seasons for this show, ordered.
    const seasonRows = db
      .select()
      .from(tvSeasons)
      .where(eq(tvSeasons.showId, id))
      .orderBy(asc(tvSeasons.seasonNumber))
      .all();

    // All episodes for this show, ordered, with this user's watch state joined.
    const episodeRows = db
      .select({
        id: tvEpisodes.id,
        showId: tvEpisodes.showId,
        seasonId: tvEpisodes.seasonId,
        seasonNumber: tvEpisodes.seasonNumber,
        episodeNumber: tvEpisodes.episodeNumber,
        episodeNumberEnd: tvEpisodes.episodeNumberEnd,
        absoluteNumber: tvEpisodes.absoluteNumber,
        title: tvEpisodes.title,
        overview: tvEpisodes.overview,
        stillPath: tvEpisodes.stillPath,
        stillMtime: tvEpisodes.stillMtime,
        stillBlur: tvEpisodes.stillBlur,
        airDate: tvEpisodes.airDate,
        communityRating: tvEpisodes.communityRating,
        runtimeSeconds: tvEpisodes.runtimeSeconds,
        runtimeMinutes: tvEpisodes.runtimeMinutes,
        videoWidth: tvEpisodes.videoWidth,
        videoHeight: tvEpisodes.videoHeight,
        videoCodec: tvEpisodes.videoCodec,
        fileSize: tvEpisodes.fileSize,
        dateAdded: tvEpisodes.dateAdded,
        isPlayed: userEpisodeData.isPlayed,
        playbackPositionSeconds: userEpisodeData.playbackPositionSeconds,
        personalRating: userEpisodeData.personalRating,
      })
      .from(tvEpisodes)
      .leftJoin(
        userEpisodeData,
        and(
          eq(userEpisodeData.episodeId, tvEpisodes.id),
          userId ? eq(userEpisodeData.userId, userId) : sql`0`
        )
      )
      .where(eq(tvEpisodes.showId, id))
      .orderBy(asc(tvEpisodes.seasonNumber), asc(tvEpisodes.episodeNumber))
      .all();

    // Group episodes under their season (by seasonId).
    const episodesBySeason = new Map<string, unknown[]>();
    for (const e of episodeRows) {
      const runtimeSeconds =
        e.runtimeSeconds || (e.runtimeMinutes ? e.runtimeMinutes * 60 : 0);
      const position = e.playbackPositionSeconds ?? 0;
      const progress =
        runtimeSeconds && position
          ? Math.min(100, Math.round((position / runtimeSeconds) * 100))
          : 0;
      const shaped = {
        ...e,
        stillPath: stampPath(
          e.stillPath ? nodePath.join(show.folderPath, e.stillPath) : null,
          e.stillMtime
        ),
        stillBlur: e.stillBlur,
        isPlayed: e.isPlayed ?? false,
        playbackPositionSeconds: position,
        progress,
      };
      const list = episodesBySeason.get(e.seasonId) ?? [];
      list.push(shaped);
      episodesBySeason.set(e.seasonId, list);
    }

    // Nested shape: seasons with their episodes.
    const seasons = seasonRows.map((s) => ({
      ...s,
      posterPath: stampPath(
        s.posterPath ? nodePath.join(show.folderPath, s.posterPath) : null,
        s.posterMtime
      ),
      posterBlur: s.posterBlur,
      episodes: episodesBySeason.get(s.id) ?? [],
    }));

    // Cast (actors) ordered by sortOrder.
    const cast = db
      .select({
        id: tvPeople.id,
        name: tvPeople.name,
        role: tvShowPeople.role,
        photoPath: tvPeople.photoPath,
        photoMtime: tvPeople.photoMtime,
        photoBlur: tvPeople.photoBlur,
        sortOrder: tvShowPeople.sortOrder,
        ageAtRelease: tvShowPeople.ageAtRelease,
      })
      .from(tvShowPeople)
      .innerJoin(tvPeople, eq(tvShowPeople.personId, tvPeople.id))
      .where(and(eq(tvShowPeople.showId, id), eq(tvPeople.type, "actor")))
      .orderBy(asc(tvShowPeople.sortOrder))
      .all();

    // Directors.
    const directors = db
      .select({
        id: tvPeople.id,
        name: tvPeople.name,
      })
      .from(tvShowPeople)
      .innerJoin(tvPeople, eq(tvShowPeople.personId, tvPeople.id))
      .where(and(eq(tvShowPeople.showId, id), eq(tvPeople.type, "director")))
      .orderBy(asc(tvShowPeople.sortOrder))
      .all();

    // User show data (favorite / rating / dimension ratings).
    let userData = null;
    if (userId) {
      const row = db
        .select()
        .from(userTvShowData)
        .where(and(eq(userTvShowData.userId, userId), eq(userTvShowData.showId, id)))
        .get();
      userData = row
        ? {
            isFavorite: row.isFavorite ?? false,
            personalRating: row.personalRating,
            dimensionRatings: row.dimensionRatings ? JSON.parse(row.dimensionRatings) : null,
          }
        : null;
    }

    const posterPath = show.posterPath
      ? nodePath.join(show.folderPath, show.posterPath)
      : null;
    const fanartPath = show.fanartPath
      ? nodePath.join(show.folderPath, show.fanartPath)
      : null;

    return NextResponse.json({
      ...show,
      posterPath: stampPath(posterPath, show.posterMtime),
      posterBlur: show.posterBlur,
      fanartPath: stampPath(fanartPath, show.fanartMtime),
      genres: show.genres ? JSON.parse(show.genres) : [],
      studios: show.studios ? JSON.parse(show.studios) : [],
      // country is stored as a plain string (origin_country[0], e.g. "US"),
      // not a JSON array — wrap it so the client always gets string[].
      country: show.country ? [show.country] : [],
      tags: show.tags ? JSON.parse(show.tags) : [],
      seasons,
      cast: cast.map((c) => ({
        ...c,
        photoPath: stampPath(c.photoPath ? resolveDataPath(c.photoPath) : null, c.photoMtime),
        photoBlur: c.photoBlur,
      })),
      directors,
      userData,
    });
  } catch (error) {
    console.error("Get tv show error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/tv/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleteFiles = request.nextUrl.searchParams.get("deleteFiles") === "true";

  try {
    const show = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
    if (!show) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Cascade removes seasons/episodes/streams/showPeople. Orphan tvPeople
    // cleanup is handled by the library delete route, not here.
    db.delete(tvShows).where(eq(tvShows.id, id)).run();

    if (deleteFiles && show.folderPath) {
      try {
        await fs.rm(show.folderPath, { recursive: true, force: true });
      } catch (fsError) {
        console.error("Failed to delete tv show folder:", show.folderPath, fsError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete tv show error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

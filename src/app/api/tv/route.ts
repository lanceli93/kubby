import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { tvShows, tvEpisodes, userEpisodeData, userTvShowData } from "@/lib/db/schema";
import { eq, desc, asc, like, sql, and, count } from "drizzle-orm";
import { auth } from "@/lib/auth";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

// GET /api/tv
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "dateAdded";
    const limitParam = searchParams.get("limit");
    const limit = parseInt(limitParam || "100", 10);
    const filter = searchParams.get("filter");
    const genre = searchParams.get("genre");
    const studio = searchParams.get("studio");
    const tag = searchParams.get("tag");
    const offsetParam = searchParams.get("offset");
    const offset = offsetParam !== null ? parseInt(offsetParam, 10) : null;

    const session = await auth();
    const userId = session?.user?.id;

    // ── filter=next-up ("Continue Watching / 追剧" row) ──────────────
    // One NextUp episode per show the user has activity on.
    if (filter === "next-up" && userId) {
      const cwLimit = Math.min(limit, 20);

      // Narrow the resume row to the active filter (library / genre / studio /
      // tag) so Continue Watching follows the rest of the page.
      const cwConditions = [eq(userTvShowData.userId, userId)];
      if (libraryId) cwConditions.push(eq(tvShows.mediaLibraryId, libraryId));
      if (genre) cwConditions.push(like(tvShows.genres, `%"${genre}"%`));
      if (studio) cwConditions.push(like(tvShows.studios, `%"${studio}"%`));
      if (tag) cwConditions.push(like(tvShows.tags, `%"${tag}"%`));

      // Candidate shows: those with a userTvShowData row, most recent first.
      const candidateShows = db
        .select({
          showId: tvShows.id,
          showTitle: tvShows.title,
          posterPath: tvShows.posterPath,
          posterMtime: tvShows.posterMtime,
          posterBlur: tvShows.posterBlur,
          folderPath: tvShows.folderPath,
        })
        .from(userTvShowData)
        .innerJoin(tvShows, eq(userTvShowData.showId, tvShows.id))
        .where(and(...cwConditions))
        .orderBy(desc(userTvShowData.lastPlayedAt))
        .limit(cwLimit)
        .all();

      const nextUpItems: unknown[] = [];

      for (const show of candidateShows) {
        // All episodes for this show, ordered, with this user's watch state.
        const episodes = db
          .select({
            episodeId: tvEpisodes.id,
            seasonNumber: tvEpisodes.seasonNumber,
            episodeNumber: tvEpisodes.episodeNumber,
            episodeTitle: tvEpisodes.title,
            stillPath: tvEpisodes.stillPath,
            stillMtime: tvEpisodes.stillMtime,
            stillBlur: tvEpisodes.stillBlur,
            runtimeSeconds: tvEpisodes.runtimeSeconds,
            runtimeMinutes: tvEpisodes.runtimeMinutes,
            playbackPositionSeconds: userEpisodeData.playbackPositionSeconds,
            isPlayed: userEpisodeData.isPlayed,
          })
          .from(tvEpisodes)
          .leftJoin(
            userEpisodeData,
            and(
              eq(userEpisodeData.episodeId, tvEpisodes.id),
              eq(userEpisodeData.userId, userId)
            )
          )
          .where(eq(tvEpisodes.showId, show.showId))
          .orderBy(asc(tvEpisodes.seasonNumber), asc(tvEpisodes.episodeNumber))
          .all();

        if (episodes.length === 0) continue;

        // Prefer an in-progress episode (position > 0 AND not played); else the
        // first unplayed episode in order. Skip the show if everything is played.
        const inProgress = episodes.find(
          (e) => (e.playbackPositionSeconds ?? 0) > 0 && !e.isPlayed
        );
        const pick = inProgress ?? episodes.find((e) => !e.isPlayed);
        if (!pick) continue; // all episodes played — nothing to resume

        const runtimeSeconds =
          pick.runtimeSeconds || (pick.runtimeMinutes ? pick.runtimeMinutes * 60 : 0);
        const position = pick.playbackPositionSeconds ?? 0;
        const progress =
          runtimeSeconds && position
            ? Math.min(100, Math.round((position / runtimeSeconds) * 100))
            : 0;

        nextUpItems.push({
          showId: show.showId,
          showTitle: show.showTitle,
          showPosterPath: stampPath(
            show.posterPath ? path.join(show.folderPath, show.posterPath) : null,
            show.posterMtime
          ),
          posterBlur: show.posterBlur,
          episodeId: pick.episodeId,
          seasonNumber: pick.seasonNumber,
          episodeNumber: pick.episodeNumber,
          episodeTitle: pick.episodeTitle,
          stillPath: stampPath(
            pick.stillPath ? path.join(show.folderPath, pick.stillPath) : null,
            pick.stillMtime
          ),
          stillBlur: pick.stillBlur,
          playbackPositionSeconds: position,
          runtimeSeconds,
          progress,
        });
      }

      return NextResponse.json(nextUpItems);
    }

    // ── filter=recently-added ───────────────────────────────────────
    if (filter === "recently-added") {
      const raLimit = Math.min(limit, 20);
      const raConditions = [];
      if (libraryId) raConditions.push(eq(tvShows.mediaLibraryId, libraryId));
      if (genre) raConditions.push(like(tvShows.genres, `%"${genre}"%`));
      if (studio) raConditions.push(like(tvShows.studios, `%"${studio}"%`));
      if (tag) raConditions.push(like(tvShows.tags, `%"${tag}"%`));

      let raQuery = db
        .select({
          id: tvShows.id,
          title: tvShows.title,
          year: tvShows.year,
          posterPath: tvShows.posterPath,
          posterMtime: tvShows.posterMtime,
          posterBlur: tvShows.posterBlur,
          fanartPath: tvShows.fanartPath,
          fanartMtime: tvShows.fanartMtime,
          folderPath: tvShows.folderPath,
          overview: tvShows.overview,
          communityRating: tvShows.communityRating,
          seasonCount: tvShows.seasonCount,
          episodeCount: tvShows.episodeCount,
        })
        .from(tvShows)
        .$dynamic();

      if (raConditions.length > 0) {
        raQuery = raQuery.where(and(...raConditions));
      }

      const raResults = raQuery.orderBy(desc(tvShows.dateAdded)).limit(raLimit).all();

      return NextResponse.json(
        raResults.map((r) => ({
          ...r,
          posterPath: stampPath(
            r.posterPath ? path.join(r.folderPath, r.posterPath) : null,
            r.posterMtime
          ),
          posterBlur: r.posterBlur,
          fanartPath: stampPath(
            r.fanartPath ? path.join(r.folderPath, r.fanartPath) : null,
            r.fanartMtime
          ),
        }))
      );
    }

    // ── Standard show grid — left join user data when logged in ──────
    const conditions = [];
    if (libraryId) {
      conditions.push(eq(tvShows.mediaLibraryId, libraryId));
    }
    if (search) {
      conditions.push(like(tvShows.title, `%${search}%`));
    }
    // genres/studios/tags are JSON text columns — match a quoted value inside
    // the array, mirroring the movie route.
    if (genre) {
      conditions.push(like(tvShows.genres, `%"${genre}"%`));
    }
    if (studio) {
      conditions.push(like(tvShows.studios, `%"${studio}"%`));
    }
    if (tag) {
      conditions.push(like(tvShows.tags, `%"${tag}"%`));
    }

    // Sort
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const orderFn = sortOrder === "asc" ? asc : desc;
    let orderClause: ReturnType<typeof asc>;
    switch (sort) {
      case "title":
        orderClause = sortOrder === "asc" ? asc(tvShows.title) : desc(tvShows.title);
        break;
      case "year":
        orderClause = orderFn(tvShows.year);
        break;
      case "rating":
        orderClause = orderFn(tvShows.communityRating);
        break;
      case "dateAdded":
      default:
        orderClause = orderFn(tvShows.dateAdded);
        break;
    }

    let baseQuery = db
      .select({
        id: tvShows.id,
        title: tvShows.title,
        originalTitle: tvShows.originalTitle,
        sortName: tvShows.sortName,
        overview: tvShows.overview,
        tagline: tvShows.tagline,
        folderPath: tvShows.folderPath,
        posterPath: tvShows.posterPath,
        posterMtime: tvShows.posterMtime,
        posterBlur: tvShows.posterBlur,
        fanartPath: tvShows.fanartPath,
        fanartMtime: tvShows.fanartMtime,
        communityRating: tvShows.communityRating,
        officialRating: tvShows.officialRating,
        premiereDate: tvShows.premiereDate,
        year: tvShows.year,
        status: tvShows.status,
        genres: tvShows.genres,
        studios: tvShows.studios,
        country: tvShows.country,
        tmdbId: tvShows.tmdbId,
        imdbId: tvShows.imdbId,
        tvdbId: tvShows.tvdbId,
        seasonCount: tvShows.seasonCount,
        episodeCount: tvShows.episodeCount,
        tags: tvShows.tags,
        mediaLibraryId: tvShows.mediaLibraryId,
        dateAdded: tvShows.dateAdded,
        isFavorite: userTvShowData.isFavorite,
        personalRating: userTvShowData.personalRating,
      })
      .from(tvShows)
      .leftJoin(
        userTvShowData,
        and(
          eq(userTvShowData.showId, tvShows.id),
          userId ? eq(userTvShowData.userId, userId) : sql`0`
        )
      )
      .$dynamic();

    if (conditions.length > 0) {
      baseQuery = baseQuery.where(and(...conditions));
    }

    // Paginated grid requests send `offset`; honor an explicit `limit` (clamped)
    // or default to 50/page. Non-paginated requests use the raw limit.
    const pageLimit =
      offset !== null
        ? limitParam !== null
          ? Math.max(1, Math.min(500, limit))
          : 50
        : limit;

    const results = baseQuery
      .orderBy(orderClause)
      .limit(pageLimit)
      .offset(offset ?? 0)
      .all();

    const showResults = results.map((r) => ({
      ...r,
      posterPath: stampPath(
        r.posterPath ? path.join(r.folderPath, r.posterPath) : null,
        r.posterMtime
      ),
      posterBlur: r.posterBlur,
      fanartPath: stampPath(
        r.fanartPath ? path.join(r.folderPath, r.fanartPath) : null,
        r.fanartMtime
      ),
      isFavorite: r.isFavorite ?? false,
    }));

    if (offset !== null) {
      let countQuery = db
        .select({ total: count() })
        .from(tvShows)
        .leftJoin(
          userTvShowData,
          and(
            eq(userTvShowData.showId, tvShows.id),
            userId ? eq(userTvShowData.userId, userId) : sql`0`
          )
        )
        .$dynamic();

      if (conditions.length > 0) {
        countQuery = countQuery.where(and(...conditions));
      }

      const [{ total: totalCount }] = countQuery.all();

      return NextResponse.json({
        items: showResults,
        totalCount,
        offset,
        limit: pageLimit,
        hasMore: offset + pageLimit < totalCount,
      });
    }

    return NextResponse.json(showResults);
  } catch (error) {
    console.error("List tv shows error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

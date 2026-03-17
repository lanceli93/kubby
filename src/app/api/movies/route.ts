import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { movies, movieDiscs, userMovieData, people, moviePeople, userPersonData } from "@/lib/db/schema";
import { eq, desc, asc, like, sql, and, count } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveDataPath } from "@/lib/paths";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

// GET /api/movies
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "dateAdded";
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const exclude = searchParams.get("exclude");
    const filter = searchParams.get("filter");
    const offsetParam = searchParams.get("offset");
    const offset = offsetParam !== null ? parseInt(offsetParam, 10) : null;

    const session = await auth();
    const userId = session?.user?.id;

    // Handle special filters that require user data join
    if (filter === "continue-watching" && userId) {
      // Hard cap at 20 items — FIFO: most recently played first, oldest items fall off
      const cwLimit = Math.min(limit, 20);
      const results = db
        .select({
          id: movies.id,
          title: movies.title,
          year: movies.year,
          posterPath: movies.posterPath,
          posterMtime: movies.posterMtime,
          posterBlur: movies.posterBlur,
          fanartPath: movies.fanartPath,
          fanartMtime: movies.fanartMtime,
          folderPath: movies.folderPath,
          communityRating: movies.communityRating,
          personalRating: userMovieData.personalRating,
          playbackPositionSeconds: userMovieData.playbackPositionSeconds,
          currentDisc: userMovieData.currentDisc,
          runtimeMinutes: movies.runtimeMinutes,
          runtimeSeconds: movies.runtimeSeconds,
          discCount: movies.discCount,
          videoWidth: movies.videoWidth,
          videoHeight: movies.videoHeight,
          isFavorite: userMovieData.isFavorite,
        })
        .from(movies)
        .innerJoin(
          userMovieData,
          and(
            eq(userMovieData.movieId, movies.id),
            eq(userMovieData.userId, userId)
          )
        )
        .where(
          and(
            // Include: has playback progress OR is on disc 2+ (between discs)
            sql`(${userMovieData.playbackPositionSeconds} > 0 OR ${userMovieData.currentDisc} > 1)`,
            eq(userMovieData.isPlayed, false)
          )
        )
        .orderBy(desc(userMovieData.lastPlayedAt))
        .limit(cwLimit)
        .all();

      // For multi-disc movies, fetch the current disc's runtime + label
      const multiDiscItems = results.filter((r) => (r.discCount ?? 1) > 1);
      const discInfoMap = new Map<string, { runtimeSeconds: number | null; label: string | null }>();

      if (multiDiscItems.length > 0) {
        // Build OR conditions: (movie_id = X AND disc_number = Y) for each item
        const discConditions = multiDiscItems.map(
          (r) => sql`(${movieDiscs.movieId} = ${r.id} AND ${movieDiscs.discNumber} = ${r.currentDisc ?? 1})`
        );
        const discRows = db
          .select({
            movieId: movieDiscs.movieId,
            runtimeSeconds: movieDiscs.runtimeSeconds,
            label: movieDiscs.label,
          })
          .from(movieDiscs)
          .where(sql`(${sql.join(discConditions, sql` OR `)})`)
          .all();

        for (const row of discRows) {
          discInfoMap.set(row.movieId, { runtimeSeconds: row.runtimeSeconds, label: row.label });
        }
      }

      return NextResponse.json(
        results.map((r) => {
          const isMultiDisc = (r.discCount ?? 1) > 1;
          const curDisc = r.currentDisc ?? 1;

          // Per-disc progress: treat each disc as an independent item
          let discRuntime: number;
          if (isMultiDisc) {
            discRuntime = discInfoMap.get(r.id)?.runtimeSeconds || 0;
          } else {
            discRuntime = r.runtimeSeconds || (r.runtimeMinutes ? r.runtimeMinutes * 60 : 0);
          }
          const progress = discRuntime && r.playbackPositionSeconds
            ? Math.min(100, Math.round((r.playbackPositionSeconds / discRuntime) * 100))
            : 0;

          // Disc label for multi-disc movies (prefix for title display)
          const discLabel = isMultiDisc
            ? discInfoMap.get(r.id)?.label || `Disc ${curDisc}`
            : null;

          return {
            ...r,
            posterPath: stampPath(r.posterPath ? path.join(r.folderPath, r.posterPath) : null, r.posterMtime),
            posterBlur: r.posterBlur,
            fanartPath: stampPath(r.fanartPath ? path.join(r.folderPath, r.fanartPath) : null, r.fanartMtime),
            progress,
            discLabel,
            currentDisc: isMultiDisc ? curDisc : undefined,
            discCount: isMultiDisc ? r.discCount : undefined,
          };
        })
      );
    }

    if (filter === "favorites" && userId) {
      const favConditions = [
        eq(userMovieData.isFavorite, true),
        ...(libraryId ? [eq(movies.mediaLibraryId, libraryId)] : []),
      ];

      const favPageLimit = offset !== null ? 50 : limit;

      const results = db
        .select({
          id: movies.id,
          title: movies.title,
          year: movies.year,
          posterPath: movies.posterPath,
          posterMtime: movies.posterMtime,
          posterBlur: movies.posterBlur,
          folderPath: movies.folderPath,
          communityRating: movies.communityRating,
          personalRating: userMovieData.personalRating,
          videoWidth: movies.videoWidth,
          videoHeight: movies.videoHeight,
          isFavorite: userMovieData.isFavorite,
        })
        .from(movies)
        .innerJoin(
          userMovieData,
          and(
            eq(userMovieData.movieId, movies.id),
            eq(userMovieData.userId, userId)
          )
        )
        .where(and(...favConditions))
        .orderBy(desc(movies.dateAdded))
        .limit(favPageLimit)
        .offset(offset ?? 0)
        .all();

      const favResults = results.map((r) => ({
        ...r,
        posterPath: stampPath(r.posterPath ? path.join(r.folderPath, r.posterPath) : null, r.posterMtime),
        posterBlur: r.posterBlur,
        isFavorite: true,
      }));

      if (offset !== null) {
        const [{ total: totalCount }] = db
          .select({ total: count() })
          .from(movies)
          .innerJoin(
            userMovieData,
            and(
              eq(userMovieData.movieId, movies.id),
              eq(userMovieData.userId, userId)
            )
          )
          .where(and(...favConditions))
          .all();

        return NextResponse.json({
          items: favResults,
          totalCount,
          offset: offset ?? 0,
          limit: favPageLimit,
          hasMore: (offset ?? 0) + favPageLimit < totalCount,
        });
      }

      return NextResponse.json(favResults);
    }

    // Standard movie list query — left join user data when logged in
    const conditions = [];

    if (libraryId) {
      conditions.push(eq(movies.mediaLibraryId, libraryId));
    }
    if (search) {
      conditions.push(like(movies.title, `%${search}%`));
    }
    const genre = searchParams.get("genre");
    if (genre) {
      conditions.push(like(movies.genres, `%"${genre}"%`));
    }
    const tag = searchParams.get("tag");
    if (tag) {
      conditions.push(like(movies.tags, `%"${tag}"%`));
    }
    const studio = searchParams.get("studio");
    if (studio) {
      conditions.push(like(movies.studios, `%"${studio}"%`));
    }
    // Multi-genre filter (OR logic): movie matches ANY selected genre
    const genres = searchParams.get("genres");
    if (genres) {
      const genreList = genres.split(",").map((g) => g.trim()).filter(Boolean);
      if (genreList.length > 0) {
        const genreConditions = genreList.map((g) => like(movies.genres, `%"${g}"%`));
        conditions.push(sql`(${sql.join(genreConditions, sql` OR `)})`);
      }
    }
    // Multi-tag filter (OR logic): movie matches ANY selected tag
    const tags = searchParams.get("tags");
    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        const tagConditions = tagList.map((t) => like(movies.tags, `%"${t}"%`));
        conditions.push(sql`(${sql.join(tagConditions, sql` OR `)})`);
      }
    }
    // Multi-year filter
    const years = searchParams.get("years");
    if (years) {
      const yearList = years.split(",").map((y) => parseInt(y.trim(), 10)).filter((y) => !isNaN(y));
      if (yearList.length > 0) {
        conditions.push(sql`${movies.year} IN (${sql.join(yearList.map((y) => sql`${y}`), sql`, `)})`);
      }
    }
    const personId = searchParams.get("personId");
    if (exclude) {
      conditions.push(sql`${movies.id} != ${exclude}`);
    }

    // Sort
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const sortDimension = searchParams.get("sortDimension");
    const orderFn = sortOrder === "asc" ? asc : desc;
    let orderClause: ReturnType<typeof asc> | ReturnType<typeof sql> | undefined;
    let rawOrderClause: ReturnType<typeof sql> | null = null;
    switch (sort) {
      case "title":
        orderClause = sortOrder === "asc" ? asc(movies.title) : desc(movies.title);
        break;
      case "releaseDate":
        orderClause = orderFn(movies.year);
        break;
      case "rating":
        orderClause = orderFn(movies.communityRating);
        break;
      case "personalRating":
        if (sortDimension) {
          const jsonPath = `$."${sortDimension}"`;
          rawOrderClause = sortOrder === "asc"
            ? sql`COALESCE(json_extract(${userMovieData.dimensionRatings}, ${jsonPath}), -1) ASC`
            : sql`COALESCE(json_extract(${userMovieData.dimensionRatings}, ${jsonPath}), -1) DESC`;
        } else {
          orderClause = orderFn(userMovieData.personalRating);
        }
        break;
      case "runtime":
        orderClause = orderFn(movies.runtimeMinutes);
        break;
      case "resolution":
        orderClause = orderFn(movies.videoWidth);
        break;
      case "fileSize":
        orderClause = orderFn(movies.fileSize);
        break;
      case "ageAtRelease":
        // Only meaningful when personId is set (joins moviePeople)
        rawOrderClause = sortOrder === "asc"
          ? sql`COALESCE(${moviePeople.ageAtRelease}, 999) ASC`
          : sql`COALESCE(${moviePeople.ageAtRelease}, -1) DESC`;
        break;
      case "dateAdded":
      default:
        orderClause = orderFn(movies.dateAdded);
        break;
    }

    const includeGenres = searchParams.get("includeGenres") === "true";

    // Build query with user data left join
    let baseQuery = db
      .select({
        id: movies.id,
        title: movies.title,
        originalTitle: movies.originalTitle,
        sortName: movies.sortName,
        overview: movies.overview,
        tagline: movies.tagline,
        filePath: movies.filePath,
        folderPath: movies.folderPath,
        posterPath: movies.posterPath,
        posterMtime: movies.posterMtime,
        posterBlur: movies.posterBlur,
        fanartPath: movies.fanartPath,
        fanartMtime: movies.fanartMtime,
        communityRating: movies.communityRating,
        officialRating: movies.officialRating,
        runtimeMinutes: movies.runtimeMinutes,
        premiereDate: movies.premiereDate,
        year: movies.year,
        genres: movies.genres,
        tags: movies.tags,
        studios: movies.studios,
        country: movies.country,
        tmdbId: movies.tmdbId,
        imdbId: movies.imdbId,
        videoWidth: movies.videoWidth,
        videoHeight: movies.videoHeight,
        mediaLibraryId: movies.mediaLibraryId,
        dateAdded: movies.dateAdded,
        isFavorite: userMovieData.isFavorite,
        isWatched: userMovieData.isPlayed,
        personalRating: userMovieData.personalRating,
      })
      .from(movies)
      .leftJoin(
        userMovieData,
        and(
          eq(userMovieData.movieId, movies.id),
          userId ? eq(userMovieData.userId, userId) : sql`0`
        )
      )
      .$dynamic();

    if (personId) {
      baseQuery = baseQuery.innerJoin(
        moviePeople,
        and(eq(moviePeople.movieId, movies.id), eq(moviePeople.personId, personId))
      );
    }

    if (conditions.length > 0) {
      baseQuery = baseQuery.where(and(...conditions));
    }

    const pageLimit = offset !== null ? 50 : limit;

    let orderedQuery = rawOrderClause
      ? baseQuery.orderBy(rawOrderClause)
      : baseQuery.orderBy(orderClause!);

    const results = orderedQuery.limit(pageLimit).offset(offset ?? 0).all();

    // When viewing a specific person's filmography, look up ageAtRelease
    let ageMap: Map<string, number | null> | null = null;
    if (personId) {
      const ageRows = db.select({ movieId: moviePeople.movieId, ageAtRelease: moviePeople.ageAtRelease })
        .from(moviePeople)
        .where(eq(moviePeople.personId, personId))
        .all();
      ageMap = new Map(ageRows.map((r) => [r.movieId, r.ageAtRelease]));
    }

    // Resolve relative paths to absolute
    const movieResults = results.map((r) => ({
      ...r,
      posterPath: stampPath(r.posterPath ? path.join(r.folderPath, r.posterPath) : null, r.posterMtime),
      posterBlur: r.posterBlur,
      fanartPath: stampPath(r.fanartPath ? path.join(r.folderPath, r.fanartPath) : null, r.fanartMtime),
      ...(includeGenres && r.genres ? { genres: JSON.parse(r.genres) } : {}),
      ...(includeGenres && r.tags ? { tags: JSON.parse(r.tags) } : {}),
      isFavorite: r.isFavorite ?? false,
      isWatched: r.isWatched ?? false,
      ...(ageMap ? { ageAtRelease: ageMap.get(r.id) ?? null } : {}),
    }));

    // If includepeople=true and there's a search query, also search people
    const includePeople = searchParams.get("includepeople") === "true";
    if (includePeople && search) {
      const peopleResults = db
        .select({
          id: people.id,
          name: people.name,
          type: people.type,
          photoPath: people.photoPath,
          photoMtime: people.photoMtime,
          personalRating: userPersonData.personalRating,
        })
        .from(people)
        .leftJoin(
          userPersonData,
          and(
            eq(userPersonData.personId, people.id),
            userId ? eq(userPersonData.userId, userId) : sql`0`
          )
        )
        .where(like(people.name, `%${search}%`))
        .limit(20)
        .all();

      return NextResponse.json({
        movies: movieResults,
        people: peopleResults.map((p) => ({ ...p, photoPath: stampPath(p.photoPath ? resolveDataPath(p.photoPath) : null, p.photoMtime) })),
      });
    }

    if (offset !== null) {
      // Build a count query with the same conditions
      let countQuery = db
        .select({ total: count() })
        .from(movies)
        .leftJoin(
          userMovieData,
          and(
            eq(userMovieData.movieId, movies.id),
            userId ? eq(userMovieData.userId, userId) : sql`0`
          )
        )
        .$dynamic();

      if (personId) {
        countQuery = countQuery.innerJoin(
          moviePeople,
          and(eq(moviePeople.movieId, movies.id), eq(moviePeople.personId, personId))
        );
      }

      if (conditions.length > 0) {
        countQuery = countQuery.where(and(...conditions));
      }

      const [{ total: totalCount }] = countQuery.all();

      return NextResponse.json({
        items: movieResults,
        totalCount,
        offset,
        limit: pageLimit,
        hasMore: offset + pageLimit < totalCount,
      });
    }

    return NextResponse.json(movieResults);
  } catch (error) {
    console.error("List movies error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

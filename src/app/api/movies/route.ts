import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { movies, userMovieData, people, moviePeople, userPersonData } from "@/lib/db/schema";
import { eq, desc, asc, like, sql, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

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

    const session = await auth();
    const userId = session?.user?.id;

    // Handle special filters that require user data join
    if (filter === "continue-watching" && userId) {
      const results = db
        .select({
          id: movies.id,
          title: movies.title,
          year: movies.year,
          posterPath: movies.posterPath,
          folderPath: movies.folderPath,
          communityRating: movies.communityRating,
          personalRating: userMovieData.personalRating,
          playbackPositionSeconds: userMovieData.playbackPositionSeconds,
          runtimeMinutes: movies.runtimeMinutes,
          runtimeSeconds: movies.runtimeSeconds,
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
            sql`${userMovieData.playbackPositionSeconds} > 0`,
            eq(userMovieData.isPlayed, false)
          )
        )
        .orderBy(desc(userMovieData.lastPlayedAt))
        .limit(limit)
        .all();

      return NextResponse.json(
        results.map((r) => {
          const totalSeconds = r.runtimeSeconds || (r.runtimeMinutes ? r.runtimeMinutes * 60 : 0);
          return {
            ...r,
            posterPath: r.posterPath ? path.join(r.folderPath, r.posterPath) : null,
            progress:
              totalSeconds && r.playbackPositionSeconds
                ? Math.min(100, Math.round((r.playbackPositionSeconds / totalSeconds) * 100))
                : 0,
          };
        })
      );
    }

    if (filter === "favorites" && userId) {
      const results = db
        .select({
          id: movies.id,
          title: movies.title,
          year: movies.year,
          posterPath: movies.posterPath,
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
        .where(
          and(
            eq(userMovieData.isFavorite, true),
            ...(libraryId ? [eq(movies.mediaLibraryId, libraryId)] : [])
          )
        )
        .orderBy(desc(movies.dateAdded))
        .limit(limit)
        .all();

      return NextResponse.json(
        results.map((r) => ({
          ...r,
          posterPath: r.posterPath ? path.join(r.folderPath, r.posterPath) : null,
          isFavorite: true,
        }))
      );
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
        fanartPath: movies.fanartPath,
        communityRating: movies.communityRating,
        officialRating: movies.officialRating,
        runtimeMinutes: movies.runtimeMinutes,
        premiereDate: movies.premiereDate,
        year: movies.year,
        genres: movies.genres,
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

    const results = rawOrderClause
      ? baseQuery.orderBy(rawOrderClause).limit(limit).all()
      : baseQuery.orderBy(orderClause!).limit(limit).all();

    // Resolve relative paths to absolute
    const movieResults = results.map((r) => ({
      ...r,
      posterPath: r.posterPath ? path.join(r.folderPath, r.posterPath) : null,
      fanartPath: r.fanartPath ? path.join(r.folderPath, r.fanartPath) : null,
      ...(includeGenres && r.genres ? { genres: JSON.parse(r.genres) } : {}),
      isFavorite: r.isFavorite ?? false,
      isWatched: r.isWatched ?? false,
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
        people: peopleResults,
      });
    }

    return NextResponse.json(movieResults);
  } catch (error) {
    console.error("List movies error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

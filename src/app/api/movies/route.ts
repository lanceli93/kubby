import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { movies, userMovieData } from "@/lib/db/schema";
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
          playbackPositionSeconds: userMovieData.playbackPositionSeconds,
          runtimeMinutes: movies.runtimeMinutes,
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
        results.map((r) => ({
          ...r,
          posterPath: r.posterPath ? path.join(r.folderPath, r.posterPath) : null,
          progress:
            r.runtimeMinutes && r.playbackPositionSeconds
              ? Math.round((r.playbackPositionSeconds / (r.runtimeMinutes * 60)) * 100)
              : 0,
        }))
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

    // Standard movie list query
    let query = db.select().from(movies).$dynamic();

    if (libraryId) {
      query = query.where(eq(movies.mediaLibraryId, libraryId));
    }
    if (search) {
      query = query.where(like(movies.title, `%${search}%`));
    }
    const genre = searchParams.get("genre");
    if (genre) {
      query = query.where(like(movies.genres, `%"${genre}"%`));
    }
    // Multi-genre filter (OR logic): movie matches ANY selected genre
    const genres = searchParams.get("genres");
    if (genres) {
      const genreList = genres.split(",").map((g) => g.trim()).filter(Boolean);
      if (genreList.length > 0) {
        const conditions = genreList.map((g) => like(movies.genres, `%"${g}"%`));
        query = query.where(sql`(${sql.join(conditions, sql` OR `)})`);
      }
    }
    // Multi-year filter
    const years = searchParams.get("years");
    if (years) {
      const yearList = years.split(",").map((y) => parseInt(y.trim(), 10)).filter((y) => !isNaN(y));
      if (yearList.length > 0) {
        query = query.where(sql`${movies.year} IN (${sql.join(yearList.map((y) => sql`${y}`), sql`, `)})`);
      }
    }
    if (exclude) {
      query = query.where(sql`${movies.id} != ${exclude}`);
    }

    // Sort
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const orderFn = sortOrder === "asc" ? asc : desc;
    switch (sort) {
      case "title":
        query = query.orderBy(sortOrder === "asc" ? asc(movies.title) : desc(movies.title));
        break;
      case "releaseDate":
        query = query.orderBy(orderFn(movies.year));
        break;
      case "rating":
        query = query.orderBy(orderFn(movies.communityRating));
        break;
      case "runtime":
        query = query.orderBy(orderFn(movies.runtimeMinutes));
        break;
      case "dateAdded":
      default:
        query = query.orderBy(orderFn(movies.dateAdded));
        break;
    }

    const results = query.limit(limit).all();
    const includeGenres = searchParams.get("includeGenres") === "true";

    // Resolve relative paths to absolute
    return NextResponse.json(
      results.map((r) => ({
        ...r,
        posterPath: r.posterPath ? path.join(r.folderPath, r.posterPath) : null,
        fanartPath: r.fanartPath ? path.join(r.folderPath, r.fanartPath) : null,
        ...(includeGenres && r.genres ? { genres: JSON.parse(r.genres) } : {}),
      }))
    );
  } catch (error) {
    console.error("List movies error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

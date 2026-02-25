import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { BUILTIN_BOOKMARK_ICONS } from "@/lib/bookmark-icons";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

type Category = "movies" | "genres" | "tags" | "people" | "bookmarks";

const ALL_LIMITS: Record<Category, number> = {
  movies: 24,
  genres: 10,
  tags: 10,
  people: 24,
  bookmarks: 24,
};

const CATEGORY_LIMITS: Record<Category, number> = {
  movies: 100,
  genres: 40,
  tags: 40,
  people: 100,
  bookmarks: 100,
};

// GET /api/search?q=...&category=...&libraryId=...
export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const category = searchParams.get("category") as Category | null;
  const libraryId = searchParams.get("libraryId") || null;
  const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;

  if (!q) {
    return NextResponse.json({
      movies: { items: [], totalCount: 0 },
      genres: [],
      tags: [],
      people: { items: [], totalCount: 0 },
      bookmarks: { items: [], totalCount: 0 },
    });
  }

  const searchPattern = `%${q}%`;
  const limits = category ? CATEGORY_LIMITS : ALL_LIMITS;

  const shouldQuery = (cat: Category) => !category || category === cat;

  // Build query functions
  async function searchMovies() {
    if (!shouldQuery("movies")) return { items: [], totalCount: 0 };
    const limit = limits.movies;

    const libraryCondition = libraryId
      ? sql`AND m.media_library_id = ${libraryId}`
      : sql``;

    const userJoin = userId
      ? sql`LEFT JOIN user_movie_data umd ON umd.movie_id = m.id AND umd.user_id = ${userId}`
      : sql`LEFT JOIN user_movie_data umd ON 0`;

    const results = db.all<{
      id: string;
      title: string;
      year: number | null;
      poster_path: string | null;
      folder_path: string;
      poster_mtime: number | null;
      community_rating: number | null;
      personal_rating: number | null;
      video_width: number | null;
      video_height: number | null;
    }>(sql`
      SELECT m.id, m.title, m.year, m.poster_path, m.folder_path, m.poster_mtime,
             m.community_rating, umd.personal_rating, m.video_width, m.video_height
      FROM movies m
      ${userJoin}
      WHERE LOWER(m.title) LIKE LOWER(${searchPattern})
      ${libraryCondition}
      ORDER BY m.community_rating DESC NULLS LAST
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `);

    const items = results.slice(0, limit).map((r) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      posterPath: stampPath(
        r.poster_path ? path.join(r.folder_path, r.poster_path) : null,
        r.poster_mtime
      ),
      communityRating: r.community_rating,
      personalRating: r.personal_rating,
      videoWidth: r.video_width,
      videoHeight: r.video_height,
    }));

    // Get total count if paginating or there are more results than the limit
    let totalCount = offset + items.length;
    if (results.length > limit || offset > 0) {
      const countResult = db.all<{ total: number }>(sql`
        SELECT COUNT(*) as total FROM movies m
        WHERE LOWER(m.title) LIKE LOWER(${searchPattern})
        ${libraryCondition}
      `);
      totalCount = countResult[0]?.total ?? totalCount;
    }

    return { items, totalCount };
  }

  async function searchGenres() {
    if (!shouldQuery("genres")) return [];
    const limit = limits.genres;

    const libraryCondition = libraryId
      ? sql`AND m.media_library_id = ${libraryId}`
      : sql``;

    // Find matching genre names + count
    const genreResults = db.all<{
      name: string;
      movie_count: number;
    }>(sql`
      SELECT je.value AS name, COUNT(DISTINCT m.id) AS movie_count
      FROM movies m, json_each(m.genres) je
      WHERE LOWER(je.value) LIKE LOWER(${searchPattern})
      ${libraryCondition}
      GROUP BY je.value
      ORDER BY movie_count DESC
      LIMIT ${limit}
    `);

    // Only fetch preview movies when in category mode (not "All" where we show chips)
    const genres = genreResults.map((g) => {
      if (!category) {
        // "All" mode — chips only, skip preview queries
        return { name: g.name, movieCount: g.movie_count, previewMovies: [] };
      }

      const previewMovies = db.all<{
        id: string;
        title: string;
        poster_path: string | null;
        folder_path: string;
        poster_mtime: number | null;
        year: number | null;
      }>(sql`
        SELECT m.id, m.title, m.poster_path, m.folder_path, m.poster_mtime, m.year
        FROM movies m, json_each(m.genres) je
        WHERE je.value = ${g.name}
        ${libraryCondition}
        ORDER BY m.community_rating DESC NULLS LAST
        LIMIT 6
      `);

      return {
        name: g.name,
        movieCount: g.movie_count,
        previewMovies: previewMovies.map((m) => ({
          id: m.id,
          title: m.title,
          posterPath: stampPath(
            m.poster_path ? path.join(m.folder_path, m.poster_path) : null,
            m.poster_mtime
          ),
          year: m.year,
        })),
      };
    });

    return genres;
  }

  async function searchTags() {
    if (!shouldQuery("tags")) return [];
    const limit = limits.tags;

    const libraryCondition = libraryId
      ? sql`AND m.media_library_id = ${libraryId}`
      : sql``;

    const tagResults = db.all<{
      name: string;
      movie_count: number;
    }>(sql`
      SELECT je.value AS name, COUNT(DISTINCT m.id) AS movie_count
      FROM movies m, json_each(m.tags) je
      WHERE LOWER(je.value) LIKE LOWER(${searchPattern})
      ${libraryCondition}
      GROUP BY je.value
      ORDER BY movie_count DESC
      LIMIT ${limit}
    `);

    const tags = tagResults.map((t) => {
      if (!category) {
        return { name: t.name, movieCount: t.movie_count, previewMovies: [] };
      }

      const previewMovies = db.all<{
        id: string;
        title: string;
        poster_path: string | null;
        folder_path: string;
        poster_mtime: number | null;
        year: number | null;
      }>(sql`
        SELECT m.id, m.title, m.poster_path, m.folder_path, m.poster_mtime, m.year
        FROM movies m, json_each(m.tags) je
        WHERE je.value = ${t.name}
        ${libraryCondition}
        ORDER BY m.community_rating DESC NULLS LAST
        LIMIT 6
      `);

      return {
        name: t.name,
        movieCount: t.movie_count,
        previewMovies: previewMovies.map((m) => ({
          id: m.id,
          title: m.title,
          posterPath: stampPath(
            m.poster_path ? path.join(m.folder_path, m.poster_path) : null,
            m.poster_mtime
          ),
          year: m.year,
        })),
      };
    });

    return tags;
  }

  async function searchPeople() {
    if (!shouldQuery("people")) return { items: [], totalCount: 0 };
    const limit = limits.people;

    const userJoin = userId
      ? sql`LEFT JOIN user_person_data upd ON upd.person_id = p.id AND upd.user_id = ${userId}`
      : sql`LEFT JOIN user_person_data upd ON 0`;

    const results = db.all<{
      id: string;
      name: string;
      type: string;
      photo_path: string | null;
      photo_mtime: number | null;
      personal_rating: number | null;
      movie_count: number;
    }>(sql`
      SELECT p.id, p.name, p.type, p.photo_path, p.photo_mtime,
             upd.personal_rating,
             COUNT(DISTINCT mp.movie_id) as movie_count
      FROM people p
      INNER JOIN movie_people mp ON mp.person_id = p.id
      ${userJoin}
      WHERE LOWER(p.name) LIKE LOWER(${searchPattern})
      GROUP BY p.id
      ORDER BY movie_count DESC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `);

    const items = results.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      photoPath: stampPath(r.photo_path, r.photo_mtime),
      personalRating: r.personal_rating,
      movieCount: r.movie_count,
    }));

    let totalCount = offset + items.length;
    if (results.length > limit || offset > 0) {
      const countResult = db.all<{ total: number }>(sql`
        SELECT COUNT(*) as total FROM (
          SELECT p.id
          FROM people p
          INNER JOIN movie_people mp ON mp.person_id = p.id
          WHERE LOWER(p.name) LIKE LOWER(${searchPattern})
          GROUP BY p.id
        )
      `);
      totalCount = countResult[0]?.total ?? totalCount;
    }

    return { items, totalCount };
  }

  async function searchBookmarks() {
    if (!shouldQuery("bookmarks")) return { items: [], totalCount: 0 };
    if (!userId) return { items: [], totalCount: 0 };
    const limit = limits.bookmarks;

    // Resolve icon IDs that match the search query (by label)
    const matchingIconIds = BUILTIN_BOOKMARK_ICONS
      .filter((icon) => icon.label.toLowerCase().includes(q.toLowerCase()))
      .map((icon) => icon.id);

    // Also check custom icons
    const customIcons = db.all<{ id: string; label: string }>(sql`
      SELECT id, label FROM bookmark_icons
      WHERE user_id = ${userId} AND LOWER(label) LIKE LOWER(${searchPattern})
    `);
    const allMatchingIconIds = [...matchingIconIds, ...customIcons.map((c) => c.id)];

    // Build icon condition
    const iconCondition = allMatchingIconIds.length > 0
      ? sql`OR mb.icon_type IN (${sql.join(allMatchingIconIds.map((id) => sql`${id}`), sql`, `)})`
      : sql``;

    const results = db.all<{
      id: string;
      timestamp_seconds: number;
      disc_number: number | null;
      icon_type: string | null;
      tags: string | null;
      note: string | null;
      thumbnail_path: string | null;
      created_at: string;
      movie_id: string;
      movie_title: string;
      movie_poster_path: string | null;
      movie_folder_path: string;
      movie_poster_mtime: number | null;
      movie_year: number | null;
      match_reason: string;
    }>(sql`
      SELECT DISTINCT
        mb.id,
        mb.timestamp_seconds,
        mb.disc_number,
        mb.icon_type,
        mb.tags,
        mb.note,
        mb.thumbnail_path,
        mb.created_at,
        mb.movie_id,
        m.title as movie_title,
        m.poster_path as movie_poster_path,
        m.folder_path as movie_folder_path,
        m.poster_mtime as movie_poster_mtime,
        m.year as movie_year,
        CASE
          WHEN mb.note IS NOT NULL AND LOWER(mb.note) LIKE LOWER(${searchPattern}) THEN 'note'
          WHEN EXISTS (SELECT 1 FROM json_each(mb.tags) WHERE LOWER(value) LIKE LOWER(${searchPattern})) THEN 'tag'
          ${allMatchingIconIds.length > 0
            ? sql`WHEN mb.icon_type IN (${sql.join(allMatchingIconIds.map((id) => sql`${id}`), sql`, `)}) THEN 'icon'`
            : sql``}
          WHEN LOWER(m.title) LIKE LOWER(${searchPattern}) THEN 'movieTitle'
          ELSE 'actor'
        END as match_reason
      FROM movie_bookmarks mb
      JOIN movies m ON mb.movie_id = m.id
      LEFT JOIN movie_people mp ON mp.movie_id = m.id
      LEFT JOIN people p ON mp.person_id = p.id
      WHERE mb.user_id = ${userId}
      AND (
        (mb.note IS NOT NULL AND LOWER(mb.note) LIKE LOWER(${searchPattern}))
        OR EXISTS (SELECT 1 FROM json_each(mb.tags) WHERE LOWER(value) LIKE LOWER(${searchPattern}))
        ${iconCondition}
        OR LOWER(m.title) LIKE LOWER(${searchPattern})
        OR LOWER(p.name) LIKE LOWER(${searchPattern})
      )
      ORDER BY mb.created_at DESC
      LIMIT ${limit + 1}
      OFFSET ${offset}
    `);

    const items = results.slice(0, limit).map((r) => ({
      id: r.id,
      timestampSeconds: r.timestamp_seconds,
      discNumber: r.disc_number,
      iconType: r.icon_type,
      tags: r.tags ? (() => { try { return JSON.parse(r.tags) as string[]; } catch { return []; } })() : [],
      note: r.note,
      thumbnailPath: r.thumbnail_path,
      createdAt: r.created_at,
      movieId: r.movie_id,
      movieTitle: r.movie_title,
      moviePosterPath: stampPath(
        r.movie_poster_path ? path.join(r.movie_folder_path, r.movie_poster_path) : null,
        r.movie_poster_mtime
      ),
      movieYear: r.movie_year,
      matchReason: r.match_reason as "tag" | "icon" | "note" | "movieTitle" | "actor",
    }));

    let totalCount = offset + items.length;
    if (results.length > limit || offset > 0) {
      const countResult = db.all<{ total: number }>(sql`
        SELECT COUNT(DISTINCT mb.id) as total
        FROM movie_bookmarks mb
        JOIN movies m ON mb.movie_id = m.id
        LEFT JOIN movie_people mp ON mp.movie_id = m.id
        LEFT JOIN people p ON mp.person_id = p.id
        WHERE mb.user_id = ${userId}
        AND (
          (mb.note IS NOT NULL AND LOWER(mb.note) LIKE LOWER(${searchPattern}))
          OR EXISTS (SELECT 1 FROM json_each(mb.tags) WHERE LOWER(value) LIKE LOWER(${searchPattern}))
          ${iconCondition}
          OR LOWER(m.title) LIKE LOWER(${searchPattern})
          OR LOWER(p.name) LIKE LOWER(${searchPattern})
        )
      `);
      totalCount = countResult[0]?.total ?? totalCount;
    }

    return { items, totalCount };
  }

  // Run queries in parallel
  const [moviesResult, genresResult, tagsResult, peopleResult, bookmarksResult] =
    await Promise.all([
      searchMovies(),
      searchGenres(),
      searchTags(),
      searchPeople(),
      searchBookmarks(),
    ]);

  return NextResponse.json({
    movies: moviesResult,
    genres: genresResult,
    tags: tagsResult,
    people: peopleResult,
    bookmarks: bookmarksResult,
  });
}

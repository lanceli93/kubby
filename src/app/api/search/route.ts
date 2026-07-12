import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { BUILTIN_BOOKMARK_ICONS } from "@/lib/bookmark-icons";
import { resolveDataPath } from "@/lib/paths";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

type Category = "movies" | "genres" | "tags" | "people" | "bookmarks";

const ALL_LIMITS: Record<Category, number> = {
  movies: 24,
  genres: 40,
  tags: 40,
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
      genres: { items: [], totalCount: 0 },
      tags: { items: [], totalCount: 0 },
      people: { items: [], totalCount: 0 },
      bookmarks: { items: [], totalCount: 0 },
      tvShows: [],
      tvEpisodes: [],
      tvPeople: [],
      tvBookmarks: [],
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
      poster_blur: string | null;
      folder_path: string;
      poster_mtime: number | null;
      community_rating: number | null;
      personal_rating: number | null;
      video_width: number | null;
      video_height: number | null;
    }>(sql`
      SELECT m.id, m.title, m.year, m.poster_path, m.poster_blur, m.folder_path, m.poster_mtime,
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
      posterBlur: r.poster_blur,
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
    if (!shouldQuery("genres")) return { items: [], totalCount: 0 };
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
      LIMIT ${limit + 1}
    `);

    const items = genreResults.slice(0, limit).map((g) => {
      if (!category) {
        // "All" mode — chips only, skip preview queries
        return { name: g.name, movieCount: g.movie_count, previewMovies: [] };
      }

      const userJoin = userId
        ? sql`LEFT JOIN user_movie_data umd ON umd.movie_id = m.id AND umd.user_id = ${userId}`
        : sql`LEFT JOIN user_movie_data umd ON 0`;

      const previewMovies = db.all<{
        id: string;
        title: string;
        poster_path: string | null;
        poster_blur: string | null;
        folder_path: string;
        poster_mtime: number | null;
        year: number | null;
        community_rating: number | null;
        personal_rating: number | null;
        video_width: number | null;
        video_height: number | null;
      }>(sql`
        SELECT m.id, m.title, m.poster_path, m.poster_blur, m.folder_path, m.poster_mtime, m.year,
               m.community_rating, umd.personal_rating, m.video_width, m.video_height
        FROM movies m
        JOIN json_each(m.genres) je ON je.value = ${g.name}
        ${userJoin}
        WHERE 1=1
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
          posterBlur: m.poster_blur,
          year: m.year,
          communityRating: m.community_rating,
          personalRating: m.personal_rating,
          videoWidth: m.video_width,
          videoHeight: m.video_height,
        })),
      };
    });

    let totalCount = items.length;
    if (genreResults.length > limit) {
      const countResult = db.all<{ total: number }>(sql`
        SELECT COUNT(*) as total FROM (
          SELECT je.value
          FROM movies m, json_each(m.genres) je
          WHERE LOWER(je.value) LIKE LOWER(${searchPattern})
          ${libraryCondition}
          GROUP BY je.value
        )
      `);
      totalCount = countResult[0]?.total ?? totalCount;
    }

    return { items, totalCount };
  }

  async function searchTags() {
    if (!shouldQuery("tags")) return { items: [], totalCount: 0 };
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
      LIMIT ${limit + 1}
    `);

    const items = tagResults.slice(0, limit).map((t) => {
      if (!category) {
        return { name: t.name, movieCount: t.movie_count, previewMovies: [] };
      }

      const userJoin = userId
        ? sql`LEFT JOIN user_movie_data umd ON umd.movie_id = m.id AND umd.user_id = ${userId}`
        : sql`LEFT JOIN user_movie_data umd ON 0`;

      const previewMovies = db.all<{
        id: string;
        title: string;
        poster_path: string | null;
        poster_blur: string | null;
        folder_path: string;
        poster_mtime: number | null;
        year: number | null;
        community_rating: number | null;
        personal_rating: number | null;
        video_width: number | null;
        video_height: number | null;
      }>(sql`
        SELECT m.id, m.title, m.poster_path, m.poster_blur, m.folder_path, m.poster_mtime, m.year,
               m.community_rating, umd.personal_rating, m.video_width, m.video_height
        FROM movies m
        JOIN json_each(m.tags) je ON je.value = ${t.name}
        ${userJoin}
        WHERE 1=1
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
          posterBlur: m.poster_blur,
          year: m.year,
          communityRating: m.community_rating,
          personalRating: m.personal_rating,
          videoWidth: m.video_width,
          videoHeight: m.video_height,
        })),
      };
    });

    let totalCount = items.length;
    if (tagResults.length > limit) {
      const countResult = db.all<{ total: number }>(sql`
        SELECT COUNT(*) as total FROM (
          SELECT je.value
          FROM movies m, json_each(m.tags) je
          WHERE LOWER(je.value) LIKE LOWER(${searchPattern})
          ${libraryCondition}
          GROUP BY je.value
        )
      `);
      totalCount = countResult[0]?.total ?? totalCount;
    }

    return { items, totalCount };
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
      photo_blur: string | null;
      photo_mtime: number | null;
      personal_rating: number | null;
      movie_count: number;
    }>(sql`
      SELECT p.id, p.name, p.type, p.photo_path, p.photo_blur, p.photo_mtime,
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
      photoPath: stampPath(r.photo_path ? resolveDataPath(r.photo_path) : null, r.photo_mtime),
      photoBlur: r.photo_blur,
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
      thumbnail_aspect: number | null;
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
        mb.thumbnail_aspect,
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
      thumbnailAspect: r.thumbnail_aspect ?? null,
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

  // ── TV domain (isolated) ─────────────────────────────────────────
  // TV search is a SEPARATE result set — its blocks touch ONLY tv_* tables
  // and are returned under distinct top-level keys so they never merge into
  // the cinema movies/people/bookmarks arrays. TV has no per-domain library
  // filter here, so `libraryId` (a cinema filter) is intentionally ignored,
  // and there is no per-category "load more" (always the "All" cap).

  async function searchTvShows() {
    const limit = ALL_LIMITS.movies;

    const results = db.all<{
      id: string;
      title: string;
      year: number | null;
      poster_path: string | null;
      poster_blur: string | null;
      folder_path: string;
      poster_mtime: number | null;
    }>(sql`
      SELECT s.id, s.title, s.year, s.poster_path, s.poster_blur, s.folder_path, s.poster_mtime
      FROM tv_shows s
      WHERE LOWER(s.title) LIKE LOWER(${searchPattern})
         OR (s.original_title IS NOT NULL AND LOWER(s.original_title) LIKE LOWER(${searchPattern}))
      ORDER BY s.community_rating DESC NULLS LAST
      LIMIT ${limit}
    `);

    return results.map((r) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      posterPath: stampPath(
        r.poster_path ? path.join(r.folder_path, r.poster_path) : null,
        r.poster_mtime
      ),
      posterBlur: r.poster_blur,
    }));
  }

  async function searchTvEpisodes() {
    const limit = ALL_LIMITS.movies;

    const results = db.all<{
      id: string;
      show_id: string;
      show_title: string;
      season_number: number;
      episode_number: number;
      title: string | null;
      still_path: string | null;
      still_mtime: number | null;
      folder_path: string;
    }>(sql`
      SELECT e.id, e.show_id, s.title AS show_title, e.season_number, e.episode_number,
             e.title, e.still_path, e.still_mtime, s.folder_path
      FROM tv_episodes e
      JOIN tv_shows s ON e.show_id = s.id
      WHERE e.title IS NOT NULL AND LOWER(e.title) LIKE LOWER(${searchPattern})
      ORDER BY s.community_rating DESC NULLS LAST
      LIMIT ${limit}
    `);

    return results.map((r) => ({
      id: r.id,
      showId: r.show_id,
      showTitle: r.show_title,
      seasonNumber: r.season_number,
      episodeNumber: r.episode_number,
      title: r.title,
      stillPath: stampPath(
        r.still_path ? path.join(r.folder_path, r.still_path) : null,
        r.still_mtime
      ),
    }));
  }

  async function searchTvPeople() {
    const limit = ALL_LIMITS.people;

    const results = db.all<{
      id: string;
      name: string;
      type: string;
      photo_path: string | null;
      photo_blur: string | null;
      photo_mtime: number | null;
    }>(sql`
      SELECT p.id, p.name, p.type, p.photo_path, p.photo_blur, p.photo_mtime
      FROM tv_people p
      INNER JOIN tv_show_people tsp ON tsp.person_id = p.id
      WHERE LOWER(p.name) LIKE LOWER(${searchPattern})
      GROUP BY p.id
      ORDER BY COUNT(DISTINCT tsp.show_id) DESC
      LIMIT ${limit}
    `);

    return results.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      photoPath: stampPath(r.photo_path ? resolveDataPath(r.photo_path) : null, r.photo_mtime),
      photoBlur: r.photo_blur,
    }));
  }

  async function searchTvBookmarks() {
    if (!userId) return [];
    const limit = ALL_LIMITS.bookmarks;

    // Resolve icon IDs that match the search query (by label) — mirrors the
    // cinema bookmark search (built-in labels + user's custom icon labels).
    const matchingIconIds = BUILTIN_BOOKMARK_ICONS
      .filter((icon) => icon.label.toLowerCase().includes(q.toLowerCase()))
      .map((icon) => icon.id);
    const customIcons = db.all<{ id: string; label: string }>(sql`
      SELECT id, label FROM bookmark_icons
      WHERE user_id = ${userId} AND LOWER(label) LIKE LOWER(${searchPattern})
    `);
    const allMatchingIconIds = [...matchingIconIds, ...customIcons.map((c) => c.id)];

    const iconCondition = allMatchingIconIds.length > 0
      ? sql`OR teb.icon_type IN (${sql.join(allMatchingIconIds.map((id) => sql`${id}`), sql`, `)})`
      : sql``;

    const results = db.all<{
      id: string;
      timestamp_seconds: number;
      icon_type: string | null;
      tags: string | null;
      note: string | null;
      thumbnail_path: string | null;
      thumbnail_aspect: number | null;
      created_at: string;
      episode_id: string;
      season_number: number;
      episode_number: number;
      episode_title: string | null;
      show_id: string;
      show_title: string;
      show_poster_path: string | null;
      show_folder_path: string;
      show_poster_mtime: number | null;
      show_year: number | null;
      match_reason: string;
    }>(sql`
      SELECT
        teb.id,
        teb.timestamp_seconds,
        teb.icon_type,
        teb.tags,
        teb.note,
        teb.thumbnail_path,
        teb.thumbnail_aspect,
        teb.created_at,
        teb.episode_id,
        e.season_number,
        e.episode_number,
        e.title as episode_title,
        s.id as show_id,
        s.title as show_title,
        s.poster_path as show_poster_path,
        s.folder_path as show_folder_path,
        s.poster_mtime as show_poster_mtime,
        s.year as show_year,
        CASE
          WHEN teb.note IS NOT NULL AND LOWER(teb.note) LIKE LOWER(${searchPattern}) THEN 'note'
          WHEN EXISTS (SELECT 1 FROM json_each(teb.tags) WHERE LOWER(value) LIKE LOWER(${searchPattern})) THEN 'tag'
          ${allMatchingIconIds.length > 0
            ? sql`WHEN teb.icon_type IN (${sql.join(allMatchingIconIds.map((id) => sql`${id}`), sql`, `)}) THEN 'icon'`
            : sql``}
          WHEN e.title IS NOT NULL AND LOWER(e.title) LIKE LOWER(${searchPattern}) THEN 'episodeTitle'
          ELSE 'showTitle'
        END as match_reason
      FROM tv_episode_bookmarks teb
      JOIN tv_episodes e ON teb.episode_id = e.id
      JOIN tv_shows s ON e.show_id = s.id
      WHERE teb.user_id = ${userId}
      AND (
        (teb.note IS NOT NULL AND LOWER(teb.note) LIKE LOWER(${searchPattern}))
        OR EXISTS (SELECT 1 FROM json_each(teb.tags) WHERE LOWER(value) LIKE LOWER(${searchPattern}))
        ${iconCondition}
        OR (e.title IS NOT NULL AND LOWER(e.title) LIKE LOWER(${searchPattern}))
        OR LOWER(s.title) LIKE LOWER(${searchPattern})
      )
      ORDER BY teb.created_at DESC
      LIMIT ${limit}
    `);

    return results.map((r) => ({
      id: r.id,
      timestampSeconds: r.timestamp_seconds,
      iconType: r.icon_type,
      tags: r.tags ? (() => { try { return JSON.parse(r.tags) as string[]; } catch { return []; } })() : [],
      note: r.note,
      thumbnailPath: r.thumbnail_path,
      thumbnailAspect: r.thumbnail_aspect ?? null,
      createdAt: r.created_at,
      episodeId: r.episode_id,
      seasonNumber: r.season_number,
      episodeNumber: r.episode_number,
      episodeTitle: r.episode_title,
      showId: r.show_id,
      showTitle: r.show_title,
      showPosterPath: stampPath(
        r.show_poster_path ? path.join(r.show_folder_path, r.show_poster_path) : null,
        r.show_poster_mtime
      ),
      showYear: r.show_year,
      matchReason: r.match_reason as "tag" | "icon" | "note" | "episodeTitle" | "showTitle",
    }));
  }

  // Run queries in parallel
  const [
    moviesResult,
    genresResult,
    tagsResult,
    peopleResult,
    bookmarksResult,
    tvShowsResult,
    tvEpisodesResult,
    tvPeopleResult,
    tvBookmarksResult,
  ] = await Promise.all([
    searchMovies(),
    searchGenres(),
    searchTags(),
    searchPeople(),
    searchBookmarks(),
    searchTvShows(),
    searchTvEpisodes(),
    searchTvPeople(),
    searchTvBookmarks(),
  ]);

  return NextResponse.json({
    movies: moviesResult,
    genres: genresResult,
    tags: tagsResult,
    people: peopleResult,
    bookmarks: bookmarksResult,
    tvShows: tvShowsResult,
    tvEpisodes: tvEpisodesResult,
    tvPeople: tvPeopleResult,
    tvBookmarks: tvBookmarksResult,
  });
}

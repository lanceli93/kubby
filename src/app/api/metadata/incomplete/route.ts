import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { movies, people, userMovieData, userPersonData } from "@/lib/db/schema";
import { sql, eq, and, count } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveDataPath } from "@/lib/paths";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

function computeMissingFields(
  type: "movies" | "people",
  row: Record<string, unknown>
): string[] {
  const missing: string[] = [];
  if (!row.overview) missing.push("overview");
  if (type === "movies") {
    if (!row.premiereDate && !row.year) missing.push("date");
    if (!row.posterPath) missing.push("photo");
  } else {
    if (!row.birthDate && !row.birthYear) missing.push("date");
    if (!row.photoPath) missing.push("photo");
  }
  return missing;
}

// GET /api/metadata/browse?type=movies|people&missing=any|overview|date|photo&search=&page=1&limit=40
// missing param: omit = all items, "any" = items missing at least one field, "overview"/"date"/"photo" = specific
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get("type") || "movies") as "movies" | "people";
    const missingParam = searchParams.get("missing") || "";
    const missingFilters = missingParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "40", 10)));
    const offset = (page - 1) * limit;

    if (type === "movies") {
      return handleMovies(userId, missingFilters, search, limit, offset);
    } else {
      return handlePeople(userId, missingFilters, search, limit, offset);
    }
  } catch (error) {
    console.error("Incomplete metadata error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function handleMovies(
  userId: string,
  missingFilters: string[],
  search: string,
  limit: number,
  offset: number
) {
  const conditions: ReturnType<typeof sql>[] = [];

  // "any" = items missing at least one field
  if (missingFilters.includes("any")) {
    conditions.push(
      sql`(${movies.overview} IS NULL OR ${movies.overview} = '' OR (${movies.premiereDate} IS NULL AND ${movies.year} IS NULL) OR ${movies.posterPath} IS NULL OR ${movies.posterPath} = '')`
    );
  } else {
    for (const f of missingFilters) {
      switch (f) {
        case "overview":
          conditions.push(sql`(${movies.overview} IS NULL OR ${movies.overview} = '')`);
          break;
        case "date":
          conditions.push(sql`(${movies.premiereDate} IS NULL AND ${movies.year} IS NULL)`);
          break;
        case "photo":
          conditions.push(sql`(${movies.posterPath} IS NULL OR ${movies.posterPath} = '')`);
          break;
      }
    }
  }

  if (search) {
    conditions.push(sql`${movies.title} LIKE ${"%" + search + "%"}`);
  }

  const whereClause = conditions.length > 0
    ? (conditions.length === 1 ? conditions[0] : sql`(${sql.join(conditions, sql` AND `)})`)
    : undefined;

  // Count
  const countQuery = db.select({ total: count() }).from(movies);
  const [{ total }] = (whereClause ? countQuery.where(whereClause) : countQuery).all();

  // Fetch with user data
  let query = db
    .select({
      id: movies.id,
      title: movies.title,
      year: movies.year,
      overview: movies.overview,
      premiereDate: movies.premiereDate,
      posterPath: movies.posterPath,
      posterMtime: movies.posterMtime,
      posterBlur: movies.posterBlur,
      folderPath: movies.folderPath,
      communityRating: movies.communityRating,
      videoWidth: movies.videoWidth,
      videoHeight: movies.videoHeight,
      videoCodec: movies.videoCodec,
      audioCodec: movies.audioCodec,
      audioChannels: movies.audioChannels,
      container: movies.container,
      runtimeSeconds: movies.runtimeSeconds,
      personalRating: userMovieData.personalRating,
      isFavorite: userMovieData.isFavorite,
      isPlayed: userMovieData.isPlayed,
    })
    .from(movies)
    .leftJoin(
      userMovieData,
      and(
        eq(userMovieData.movieId, movies.id),
        eq(userMovieData.userId, userId)
      )
    )
    .$dynamic();

  if (whereClause) query = query.where(whereClause);

  const rows = query
    .orderBy(movies.title)
    .limit(limit)
    .offset(offset)
    .all();

  const items = rows.map((r) => ({
    ...r,
    posterPath: stampPath(
      r.posterPath ? path.join(r.folderPath, r.posterPath) : null,
      r.posterMtime
    ),
    posterBlur: r.posterBlur,
    isFavorite: r.isFavorite ?? false,
    isPlayed: r.isPlayed ?? false,
    missingFields: computeMissingFields("movies", r),
  }));

  return NextResponse.json({ items, total });
}

function handlePeople(
  userId: string,
  missingFilters: string[],
  search: string,
  limit: number,
  offset: number
) {
  const conditions: ReturnType<typeof sql>[] = [];

  if (missingFilters.includes("any")) {
    conditions.push(
      sql`(p.overview IS NULL OR p.overview = '' OR (p.birth_date IS NULL AND p.birth_year IS NULL) OR p.photo_path IS NULL OR p.photo_path = '')`
    );
  } else {
    for (const f of missingFilters) {
      switch (f) {
        case "overview":
          conditions.push(sql`(p.overview IS NULL OR p.overview = '')`);
          break;
        case "date":
          conditions.push(sql`(p.birth_date IS NULL AND p.birth_year IS NULL)`);
          break;
        case "photo":
          conditions.push(sql`(p.photo_path IS NULL OR p.photo_path = '')`);
          break;
      }
    }
  }

  if (search) {
    conditions.push(sql`p.name LIKE ${"%" + search + "%"}`);
  }

  const whereClause = conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const userJoin = sql`LEFT JOIN user_person_data upd ON upd.person_id = p.id AND upd.user_id = ${userId}`;

  // Count
  const countResult = db.all<{ total: number }>(sql`
    SELECT COUNT(*) as total FROM people p
    ${whereClause}
  `);
  const total = countResult[0]?.total ?? 0;

  // Fetch
  const rows = db.all<{
    id: string;
    name: string;
    type: string;
    overview: string | null;
    birth_date: string | null;
    birth_year: number | null;
    photo_path: string | null;
    photo_mtime: number | null;
    photo_blur: string | null;
    personal_rating: number | null;
    is_favorite: number | null;
  }>(sql`
    SELECT
      p.id,
      p.name,
      p.type,
      p.overview,
      p.birth_date,
      p.birth_year,
      p.photo_path,
      p.photo_mtime,
      p.photo_blur,
      upd.personal_rating,
      upd.is_favorite
    FROM people p
    ${userJoin}
    ${whereClause}
    ORDER BY p.name ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    photoPath: stampPath(
      r.photo_path ? resolveDataPath(r.photo_path) : null,
      r.photo_mtime
    ),
    photoBlur: r.photo_blur,
    personalRating: r.personal_rating,
    isFavorite: !!r.is_favorite,
    missingFields: computeMissingFields("people", {
      overview: r.overview,
      birthDate: r.birth_date,
      birthYear: r.birth_year,
      photoPath: r.photo_path,
    }),
  }));

  return NextResponse.json({ items, total });
}

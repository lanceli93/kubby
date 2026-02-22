import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

// GET /api/people
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "name";
    const sortOrder = searchParams.get("sortOrder") || (sort === "name" ? "asc" : "desc");
    const typesParam = searchParams.get("types");
    const tagsParam = searchParams.get("tags");
    const tierParam = searchParams.get("tier");
    const sortDimension = searchParams.get("sortDimension");
    const limit = parseInt(searchParams.get("limit") || "200", 10);
    const offsetParam = searchParams.get("offset");
    const offset = offsetParam !== null ? parseInt(offsetParam, 10) : null;

    if (!libraryId) {
      return NextResponse.json({ error: "libraryId is required" }, { status: 400 });
    }

    const session = await auth();
    const userId = session?.user?.id;

    // Build conditions using raw SQL strings with parameterized values
    const conditions: ReturnType<typeof sql>[] = [];
    conditions.push(sql`m.media_library_id = ${libraryId}`);

    if (search) {
      conditions.push(sql`p.name LIKE ${"%" + search + "%"}`);
    }

    if (typesParam) {
      const types = typesParam.split(",").map((t) => t.trim()).filter(Boolean);
      if (types.length > 0) {
        const typeConds = types.map((t) => sql`p.type = ${t}`);
        conditions.push(sql`(${sql.join(typeConds, sql` OR `)})`);
      }
    }

    if (tagsParam) {
      const tags = tagsParam.split(",").map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) {
        const tagConds = tags.map((t) => sql`p.tags LIKE ${'%"' + t + '"%'}`);
        conditions.push(sql`(${sql.join(tagConds, sql` OR `)})`);
      }
    }

    // Tier filtering in SQL (when offset-based pagination is used)
    if (tierParam) {
      const tiers = tierParam.split(",").map((t) => t.trim()).filter(Boolean);
      const includeUnrated = tiers.includes("unrated");
      const tierNames = tiers.filter((t) => t !== "unrated");

      const tierConditions: ReturnType<typeof sql>[] = [];

      for (const tier of tierNames) {
        switch (tier) {
          case "SSS": tierConditions.push(sql`upd.personal_rating >= 9.5`); break;
          case "SS": tierConditions.push(sql`(upd.personal_rating >= 9.0 AND upd.personal_rating < 9.5)`); break;
          case "S": tierConditions.push(sql`(upd.personal_rating >= 8.5 AND upd.personal_rating < 9.0)`); break;
          case "A": tierConditions.push(sql`(upd.personal_rating >= 8.0 AND upd.personal_rating < 8.5)`); break;
          case "B": tierConditions.push(sql`(upd.personal_rating >= 7.0 AND upd.personal_rating < 8.0)`); break;
          case "C": tierConditions.push(sql`(upd.personal_rating >= 6.0 AND upd.personal_rating < 7.0)`); break;
          case "D": tierConditions.push(sql`(upd.personal_rating >= 5.0 AND upd.personal_rating < 6.0)`); break;
          case "E": tierConditions.push(sql`(upd.personal_rating > 0 AND upd.personal_rating < 5.0)`); break;
        }
      }

      if (includeUnrated) {
        tierConditions.push(sql`(upd.personal_rating IS NULL OR upd.personal_rating <= 0)`);
      }

      if (tierConditions.length > 0) {
        conditions.push(sql`(${sql.join(tierConditions, sql` OR `)})`);
      } else {
        // Tier param provided but no valid tiers matched — return empty
        conditions.push(sql`0`);
      }
    }

    const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

    // Sort clause
    let orderClause: ReturnType<typeof sql>;
    switch (sort) {
      case "personalRating":
        if (sortDimension) {
          const jsonPath = `$."${sortDimension}"`;
          orderClause = sortOrder === "asc"
            ? sql`ORDER BY COALESCE(json_extract(upd.dimension_ratings, ${jsonPath}), -1) ASC`
            : sql`ORDER BY COALESCE(json_extract(upd.dimension_ratings, ${jsonPath}), -1) DESC`;
        } else {
          orderClause = sortOrder === "asc"
            ? sql`ORDER BY COALESCE(upd.personal_rating, -1) ASC`
            : sql`ORDER BY COALESCE(upd.personal_rating, -1) DESC`;
        }
        break;
      case "dateAdded":
        orderClause = sortOrder === "asc"
          ? sql`ORDER BY p.date_added ASC`
          : sql`ORDER BY p.date_added DESC`;
        break;
      case "movieCount":
        orderClause = sortOrder === "asc"
          ? sql`ORDER BY movie_count ASC`
          : sql`ORDER BY movie_count DESC`;
        break;
      case "name":
      default:
        orderClause = sortOrder === "asc"
          ? sql`ORDER BY p.name ASC`
          : sql`ORDER BY p.name DESC`;
        break;
    }

    const userJoin = userId
      ? sql`LEFT JOIN user_person_data upd ON upd.person_id = p.id AND upd.user_id = ${userId}`
      : sql`LEFT JOIN user_person_data upd ON 0`;

    const pageLimit = offset !== null ? 100 : limit;
    const offsetValue = offset ?? 0;

    const results = db.all<{
      id: string;
      name: string;
      type: string;
      photo_path: string | null;
      photo_mtime: number | null;
      photo_blur: string | null;
      tags: string | null;
      date_added: string;
      personal_rating: number | null;
      movie_count: number;
    }>(sql`
      SELECT
        p.id,
        p.name,
        p.type,
        p.photo_path,
        p.photo_mtime,
        p.photo_blur,
        p.tags,
        p.date_added,
        upd.personal_rating,
        COUNT(DISTINCT mp.movie_id) as movie_count
      FROM people p
      INNER JOIN movie_people mp ON mp.person_id = p.id
      INNER JOIN movies m ON m.id = mp.movie_id
      ${userJoin}
      ${whereClause}
      GROUP BY p.id
      ${orderClause}
      LIMIT ${pageLimit}
      OFFSET ${offsetValue}
    `);

    // Map to camelCase
    const filtered = results.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      photoPath: stampPath(r.photo_path, r.photo_mtime),
      photoBlur: r.photo_blur,
      tags: r.tags ? (() => { try { return JSON.parse(r.tags); } catch { return []; } })() : [],
      dateAdded: r.date_added,
      personalRating: r.personal_rating,
      movieCount: r.movie_count,
    }));

    if (offset !== null) {
      // Count query with same conditions
      const countResult = db.all<{ total: number }>(sql`
        SELECT COUNT(*) as total FROM (
          SELECT p.id
          FROM people p
          INNER JOIN movie_people mp ON mp.person_id = p.id
          INNER JOIN movies m ON m.id = mp.movie_id
          ${userJoin}
          ${whereClause}
          GROUP BY p.id
        )
      `);
      const totalCount = countResult[0]?.total ?? 0;

      return NextResponse.json({
        items: filtered,
        totalCount,
        offset: offsetValue,
        limit: pageLimit,
        hasMore: offsetValue + pageLimit < totalCount,
      });
    }

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("List people error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

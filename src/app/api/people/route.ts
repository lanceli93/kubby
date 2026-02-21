import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { people, moviePeople, movies, userPersonData } from "@/lib/db/schema";
import { eq, like, sql, and, asc, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getTier, type Tier } from "@/lib/tier";

// Tier to rating range mapping
function getTierRange(tier: string): [number, number] | null {
  switch (tier) {
    case "SSS": return [9.5, 10];
    case "SS": return [9.0, 9.5];
    case "S": return [8.5, 9.0];
    case "A": return [8.0, 8.5];
    case "B": return [7.0, 8.0];
    case "C": return [6.0, 7.0];
    case "D": return [5.0, 6.0];
    case "E": return [0, 5.0];
    default: return null;
  }
}

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
    const limit = parseInt(searchParams.get("limit") || "200", 10);

    if (!libraryId) {
      return NextResponse.json({ error: "libraryId is required" }, { status: 400 });
    }

    const session = await auth();
    const userId = session?.user?.id;

    // Build query: distinct people linked to movies in this library
    // We use raw SQL for the aggregation query
    const conditions: ReturnType<typeof sql>[] = [];
    conditions.push(sql`${movies.mediaLibraryId} = ${libraryId}`);

    if (search) {
      conditions.push(sql`${people.name} LIKE ${"%" + search + "%"}`);
    }

    if (typesParam) {
      const types = typesParam.split(",").map((t) => t.trim()).filter(Boolean);
      if (types.length > 0) {
        const typeConds = types.map((t) => sql`${people.type} = ${t}`);
        conditions.push(sql`(${sql.join(typeConds, sql` OR `)})`);
      }
    }

    if (tagsParam) {
      const tags = tagsParam.split(",").map((t) => t.trim()).filter(Boolean);
      if (tags.length > 0) {
        const tagConds = tags.map((t) => sql`${people.tags} LIKE ${"%" + JSON.stringify(t).slice(0, -1) + "%"}`);
        conditions.push(sql`(${sql.join(tagConds, sql` OR `)})`);
      }
    }

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    // Sort clause
    let orderClause: ReturnType<typeof sql>;
    switch (sort) {
      case "personalRating":
        orderClause = sortOrder === "asc"
          ? sql`ORDER BY COALESCE(upd.personal_rating, -1) ASC`
          : sql`ORDER BY COALESCE(upd.personal_rating, -1) DESC`;
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

    const results = db.all<{
      id: string;
      name: string;
      type: string;
      photo_path: string | null;
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
      LIMIT ${limit}
    `);

    // Apply tier filter in application code
    let filtered = results.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      photoPath: r.photo_path,
      tags: r.tags ? (() => { try { return JSON.parse(r.tags); } catch { return []; } })() : [],
      dateAdded: r.date_added,
      personalRating: r.personal_rating,
      movieCount: r.movie_count,
    }));

    if (tierParam) {
      const tiers = tierParam.split(",").map((t) => t.trim()).filter(Boolean);
      const includeUnrated = tiers.includes("unrated");
      const tierNames = tiers.filter((t) => t !== "unrated");

      filtered = filtered.filter((p) => {
        if (p.personalRating == null || p.personalRating <= 0) {
          return includeUnrated;
        }
        if (tierNames.length === 0) return false;
        const personTier = getTier(p.personalRating);
        return tierNames.includes(personTier);
      });
    }

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("List people error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

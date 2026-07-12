import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveDataPath } from "@/lib/paths";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

// GET /api/tv/people
//
// Isolated TV-domain people LIST — queries tv_people / tv_show_people / tv_shows
// and (when logged in) user_tv_person_data ONLY. NEVER touches the cinema people
// tables. Mirrors /api/people's sort/filter/scope semantics against the TV tables.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const libraryId = searchParams.get("libraryId");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "name";
    const sortOrder = searchParams.get("sortOrder") || (sort === "name" ? "asc" : "desc");
    const typesParam = searchParams.get("types");
    const filter = searchParams.get("filter");
    const limit = parseInt(searchParams.get("limit") || "200", 10);
    const offsetParam = searchParams.get("offset");
    const offset = offsetParam !== null ? parseInt(offsetParam, 10) : null;

    const session = await auth();
    const userId = session?.user?.id;

    // Build conditions using raw SQL strings with parameterized values.
    const conditions: ReturnType<typeof sql>[] = [];
    if (libraryId) {
      conditions.push(sql`s.media_library_id = ${libraryId}`);
    }

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

    if (filter === "favorites") {
      conditions.push(sql`utpd.is_favorite = 1`);
    }

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    // Sort clause
    let orderClause: ReturnType<typeof sql>;
    switch (sort) {
      case "personalRating":
        orderClause = sortOrder === "asc"
          ? sql`ORDER BY COALESCE(utpd.personal_rating, -1) ASC`
          : sql`ORDER BY COALESCE(utpd.personal_rating, -1) DESC`;
        break;
      case "dateAdded":
        orderClause = sortOrder === "asc"
          ? sql`ORDER BY p.date_added ASC`
          : sql`ORDER BY p.date_added DESC`;
        break;
      case "showCount":
        orderClause = sortOrder === "asc"
          ? sql`ORDER BY show_count ASC`
          : sql`ORDER BY show_count DESC`;
        break;
      case "name":
      default:
        orderClause = sortOrder === "asc"
          ? sql`ORDER BY p.name ASC`
          : sql`ORDER BY p.name DESC`;
        break;
    }

    const userJoin = userId
      ? sql`LEFT JOIN user_tv_person_data utpd ON utpd.person_id = p.id AND utpd.user_id = ${userId}`
      : sql`LEFT JOIN user_tv_person_data utpd ON 0`;

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
      is_favorite: number | null;
      show_count: number;
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
        utpd.personal_rating,
        utpd.is_favorite,
        COUNT(DISTINCT sp.show_id) as show_count
      FROM tv_people p
      INNER JOIN tv_show_people sp ON sp.person_id = p.id
      INNER JOIN tv_shows s ON s.id = sp.show_id
      ${userJoin}
      ${whereClause}
      GROUP BY p.id
      ${orderClause}
      LIMIT ${pageLimit}
      OFFSET ${offsetValue}
    `);

    // Map to camelCase. Photo paths are stored relative to the data dir under
    // metadata/tv-people/… — resolve + stamp exactly like /api/tv/people/[id].
    const filtered = results.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      photoPath: stampPath(r.photo_path ? resolveDataPath(r.photo_path) : null, r.photo_mtime),
      photoBlur: r.photo_blur,
      tags: r.tags ? (() => { try { return JSON.parse(r.tags); } catch { return []; } })() : [],
      dateAdded: r.date_added,
      personalRating: r.personal_rating,
      isFavorite: !!r.is_favorite,
      showCount: r.show_count,
    }));

    if (offset !== null) {
      // Count query with same conditions.
      const countResult = db.all<{ total: number }>(sql`
        SELECT COUNT(*) as total FROM (
          SELECT p.id
          FROM tv_people p
          INNER JOIN tv_show_people sp ON sp.person_id = p.id
          INNER JOIN tv_shows s ON s.id = sp.show_id
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
    console.error("List tv people error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

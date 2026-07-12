import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { resolveDataPath } from "@/lib/paths";
import { getImageAspect } from "@/lib/blur-utils";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

/** Fallback: read mtime from filesystem for paths without stored mtime (e.g. person fanart). */
const stampPathFs = (p: string | null) => {
  if (!p) return null;
  try { return `${p}|${fs.statSync(p).mtimeMs}`; } catch { return p; }
};

// Fisher–Yates in-place shuffle so entries aren't grouped per person.
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface PersonRow {
  id: string;
  name: string;
  type: string;
  photo_path: string | null;
  photo_mtime: number | null;
  photo_blur: string | null;
  fanart_path: string | null;
  birth_year: number | null;
  personal_rating: number | null;
  is_favorite: number | null;
  show_count: number;
}

interface WallEntry {
  id: string;
  personId: string;
  name: string;
  type: string;
  posterPath: string | null;
  fanartPath: string | null;
  posterBlur: string | null;
  // True width/height ratio of poster/fanart so the mosaic sizes each tile to
  // its image (no crop). posterAspect = the head-shot's ratio, fanartAspect =
  // the person's own fanart ratio.
  posterAspect: number | null;
  fanartAspect: number | null;
  birthYear: number | null;
  showCount: number;
  personalRating: number | null;
  isFavorite: boolean;
}

// Strip the `|mtime` cache-bust suffix a stamped path carries, yielding the raw
// filesystem path getImageAspect needs. Windows paths ("D:\...") never contain
// a bare "|", so splitting on the last "|" is safe.
function unstamp(p: string | null): string | null {
  if (!p) return null;
  const i = p.lastIndexOf("|");
  return i > 0 ? p.slice(0, i) : p;
}

// GET /api/tv/people/hero-wall — TV people pool for the home People hero poster
// mosaic. Isolated TV-domain: queries tv_people + user_tv_person_data ONLY,
// NEVER the cinema people tables. A person MUST have a photo to enter the wall.
// Mirrors /api/people/hero-wall's response shape; TV people have no gallery
// infrastructure so this expands to one photo entry per person (+ optional own
// fanart).
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Query-param filters (no persisted TV mosaic config yet). Absent params
    // keep the permissive default.
    const boolParam = (name: string, fallback: boolean): boolean => {
      const raw = searchParams.get(name);
      if (raw === null) return fallback;
      return raw === "true";
    };
    const includeFanart = boolParam("includeFanart", true);
    const favoritesOnly = boolParam("favoritesOnly", false);

    // tiers: present-but-empty string → [] (meaning all — no rating filter).
    const tiersParam = searchParams.get("tiers");
    const tiers = tiersParam !== null
      ? tiersParam.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    const limitParam = searchParams.get("limit");
    const limit = Math.max(
      1,
      Math.min(150, parseInt(limitParam || "60", 10) || 60)
    );

    // Build the pool query: people with a photo, ≥1 show, honoring the
    // favorites filter. Always LEFT JOIN user_tv_person_data so we can return
    // personalRating / isFavorite.
    const conditions: ReturnType<typeof sql>[] = [
      sql`p.photo_path IS NOT NULL`,
    ];

    // Rating-tier filter — mirrors /api/people/hero-wall. Empty tiers = no
    // filter (all). "unrated" matches people with no personal rating (NULL or ≤ 0).
    if (tiers.length > 0) {
      const includeUnrated = tiers.includes("unrated");
      const tierNames = tiers.filter((t) => t !== "unrated");
      const tierConds: ReturnType<typeof sql>[] = [];

      for (const tier of tierNames) {
        switch (tier) {
          case "SSS": tierConds.push(sql`utpd.personal_rating >= 9.5`); break;
          case "SS": tierConds.push(sql`(utpd.personal_rating >= 9.0 AND utpd.personal_rating < 9.5)`); break;
          case "S": tierConds.push(sql`(utpd.personal_rating >= 8.5 AND utpd.personal_rating < 9.0)`); break;
          case "A": tierConds.push(sql`(utpd.personal_rating >= 8.0 AND utpd.personal_rating < 8.5)`); break;
          case "B": tierConds.push(sql`(utpd.personal_rating >= 7.0 AND utpd.personal_rating < 8.0)`); break;
          case "C": tierConds.push(sql`(utpd.personal_rating >= 6.0 AND utpd.personal_rating < 7.0)`); break;
          case "D": tierConds.push(sql`(utpd.personal_rating >= 5.0 AND utpd.personal_rating < 6.0)`); break;
          case "E": tierConds.push(sql`(utpd.personal_rating > 0 AND utpd.personal_rating < 5.0)`); break;
        }
      }

      if (includeUnrated) {
        tierConds.push(sql`(utpd.personal_rating IS NULL OR utpd.personal_rating <= 0)`);
      }

      // Valid tiers were requested but none matched a known bucket — match nothing.
      conditions.push(
        tierConds.length > 0 ? sql`(${sql.join(tierConds, sql` OR `)})` : sql`0`
      );
    }

    if (favoritesOnly) {
      conditions.push(sql`utpd.is_favorite = 1`);
    }

    const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

    const rows = db.all<PersonRow>(sql`
      SELECT
        p.id,
        p.name,
        p.type,
        p.photo_path,
        p.photo_mtime,
        p.photo_blur,
        p.fanart_path,
        p.birth_year,
        utpd.personal_rating,
        utpd.is_favorite,
        COUNT(DISTINCT sp.show_id) as show_count
      FROM tv_people p
      INNER JOIN tv_show_people sp ON sp.person_id = p.id
      LEFT JOIN user_tv_person_data utpd ON utpd.person_id = p.id AND utpd.user_id = ${userId}
      ${whereClause}
      GROUP BY p.id
      ORDER BY RANDOM()
      LIMIT ${limit}
    `);

    // Expand each pooled person into a flat photo entry (+ optional own fanart).
    const entries: WallEntry[] = [];

    for (const r of rows) {
      const personalRating = r.personal_rating;
      const isFavorite = !!r.is_favorite;

      // Person fanart lives in a relative DB column with no stored mtime — use
      // the fs-mtime fallback like /api/tv/people/[id]. Do NOT backfill from disk.
      const ownFanart =
        includeFanart && r.fanart_path
          ? stampPathFs(resolveDataPath(r.fanart_path))
          : null;

      // Photo entry — keyed by the real person id. Aspects filled after the
      // final slice so we only stat the images actually returned.
      entries.push({
        id: r.id,
        personId: r.id,
        name: r.name,
        type: r.type,
        posterPath: stampPath(resolveDataPath(r.photo_path!), r.photo_mtime),
        fanartPath: ownFanart,
        posterBlur: r.photo_blur,
        posterAspect: null,
        fanartAspect: null,
        birthYear: r.birth_year,
        showCount: r.show_count,
        personalRating,
        isFavorite,
      });
    }

    // Shuffle the flat array, then truncate to the requested limit.
    const results = shuffle(entries).slice(0, limit);

    // Read true aspect ratios for the returned entries only (post-slice, so we
    // never stat images we drop). Header-only + cached per file+mtime, run in
    // parallel. A null (missing file / no sharp) leaves the tile on its fixed
    // fallback ratio.
    await Promise.all(
      results.map(async (e) => {
        const posterFs = unstamp(e.posterPath);
        const fanartFs = unstamp(e.fanartPath);
        const [pa, fa] = await Promise.all([
          posterFs ? getImageAspect(posterFs) : Promise.resolve(null),
          fanartFs ? getImageAspect(fanartFs) : Promise.resolve(null),
        ]);
        e.posterAspect = pa;
        e.fanartAspect = fa;
      })
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error("Hero wall tv people error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getPersonDir } from "@/lib/person-utils";
import { resolveDataPath } from "@/lib/paths";
import {
  PeopleMosaicConfig,
  normalizePeopleMosaicConfig,
} from "@/lib/people-mosaic-config";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

/** Fallback: read mtime from filesystem for paths without stored mtime (e.g. person fanart / gallery). */
const stampPathFs = (p: string | null) => {
  if (!p) return null;
  try { return `${p}|${fs.statSync(p).mtimeMs}`; } catch { return p; }
};

// Parses a stored JSON column, degrading to null on corrupt data instead of throwing.
function parseJsonSafe(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// Fisher–Yates in-place shuffle so entries aren't grouped per person.
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

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
  movie_count: number;
}

interface WallEntry {
  id: string;
  personId: string;
  name: string;
  type: string;
  posterPath: string | null;
  fanartPath: string | null;
  posterBlur: string | null;
  birthYear: number | null;
  movieCount: number;
  personalRating: number | null;
  isFavorite: boolean;
}

// GET /api/people/hero-wall — people pool for the home People hero poster mosaic.
// Honors the user's saved PeopleMosaicConfig (image sources + type/favorites
// filters), with query-param overrides for live preview. A person MUST have a
// photo to enter the wall.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // 1. Load + normalize the user's saved config (null/corrupt → defaults).
    const prefRow = db
      .select({ peopleMosaicConfig: userPreferences.peopleMosaicConfig })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .get();

    const savedConfig = normalizePeopleMosaicConfig(
      parseJsonSafe(prefRow?.peopleMosaicConfig ?? null)
    );

    // 2. Apply query-param overrides (preferences preview). Absent params keep
    //    the saved value.
    const merged: PeopleMosaicConfig = { ...savedConfig };

    const boolOverride = (name: string): boolean | undefined => {
      const raw = searchParams.get(name);
      if (raw === null) return undefined; // absent → use saved
      return raw === "true";
    };

    const includeFanartOverride = boolOverride("includeFanart");
    if (includeFanartOverride !== undefined) merged.includeFanart = includeFanartOverride;
    const includeGalleryOverride = boolOverride("includeGallery");
    if (includeGalleryOverride !== undefined) merged.includeGallery = includeGalleryOverride;
    const favoritesOnlyOverride = boolOverride("favoritesOnly");
    if (favoritesOnlyOverride !== undefined) merged.favoritesOnly = favoritesOnlyOverride;

    const galleryCountParam = searchParams.get("galleryCount");
    if (galleryCountParam !== null) {
      const n = parseInt(galleryCountParam, 10);
      merged.galleryCount = Number.isFinite(n) ? n : merged.galleryCount;
    }

    // tiers: present-but-empty string → [] (meaning all — no rating filter).
    const tiersParam = searchParams.get("tiers");
    if (tiersParam !== null) {
      merged.tiers = tiersParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean) as PeopleMosaicConfig["tiers"];
    }

    // Re-normalize the merged result once more.
    const config = normalizePeopleMosaicConfig(merged);

    const limitParam = searchParams.get("limit");
    const limit = Math.max(
      1,
      Math.min(150, parseInt(limitParam || "60", 10) || 60)
    );

    // 3. Build the pool query: people with a photo, ≥1 movie, honoring the
    //    type + favorites filters. Always LEFT JOIN user_person_data so we can
    //    return personalRating / isFavorite.
    const conditions: ReturnType<typeof sql>[] = [
      sql`p.photo_path IS NOT NULL`,
    ];

    // Rating-tier filter — mirrors /api/people. Empty tiers = no filter (all).
    // "unrated" matches people with no personal rating (NULL or ≤ 0).
    if (config.tiers.length > 0) {
      const includeUnrated = config.tiers.includes("unrated");
      const tierNames = config.tiers.filter((t) => t !== "unrated");
      const tierConds: ReturnType<typeof sql>[] = [];

      for (const tier of tierNames) {
        switch (tier) {
          case "SSS": tierConds.push(sql`upd.personal_rating >= 9.5`); break;
          case "SS": tierConds.push(sql`(upd.personal_rating >= 9.0 AND upd.personal_rating < 9.5)`); break;
          case "S": tierConds.push(sql`(upd.personal_rating >= 8.5 AND upd.personal_rating < 9.0)`); break;
          case "A": tierConds.push(sql`(upd.personal_rating >= 8.0 AND upd.personal_rating < 8.5)`); break;
          case "B": tierConds.push(sql`(upd.personal_rating >= 7.0 AND upd.personal_rating < 8.0)`); break;
          case "C": tierConds.push(sql`(upd.personal_rating >= 6.0 AND upd.personal_rating < 7.0)`); break;
          case "D": tierConds.push(sql`(upd.personal_rating >= 5.0 AND upd.personal_rating < 6.0)`); break;
          case "E": tierConds.push(sql`(upd.personal_rating > 0 AND upd.personal_rating < 5.0)`); break;
        }
      }

      if (includeUnrated) {
        tierConds.push(sql`(upd.personal_rating IS NULL OR upd.personal_rating <= 0)`);
      }

      // Valid tiers were requested but none matched a known bucket — match nothing.
      conditions.push(
        tierConds.length > 0 ? sql`(${sql.join(tierConds, sql` OR `)})` : sql`0`
      );
    }

    if (config.favoritesOnly) {
      conditions.push(sql`upd.is_favorite = 1`);
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
        upd.personal_rating,
        upd.is_favorite,
        COUNT(DISTINCT mp.movie_id) as movie_count
      FROM people p
      INNER JOIN movie_people mp ON mp.person_id = p.id
      LEFT JOIN user_person_data upd ON upd.person_id = p.id AND upd.user_id = ${userId}
      ${whereClause}
      GROUP BY p.id
      ORDER BY RANDOM()
      LIMIT ${limit}
    `);

    // 4. Expand each pooled person into flat entries: their photo entry, plus
    //    (optionally) one entry per sampled gallery image.
    const entries: WallEntry[] = [];

    for (const r of rows) {
      const personalRating = r.personal_rating;
      const isFavorite = !!r.is_favorite;

      // Person fanart lives in a relative DB column with no stored mtime — use
      // the fs-mtime fallback like /api/people/[id]. Do NOT backfill from disk.
      const ownFanart =
        config.includeFanart && r.fanart_path
          ? stampPathFs(resolveDataPath(r.fanart_path))
          : null;

      // Photo entry — keyed by the real person id.
      entries.push({
        id: r.id,
        personId: r.id,
        name: r.name,
        type: r.type,
        posterPath: stampPath(resolveDataPath(r.photo_path!), r.photo_mtime),
        fanartPath: ownFanart,
        posterBlur: r.photo_blur,
        birthYear: r.birth_year,
        movieCount: r.movie_count,
        personalRating,
        isFavorite,
      });

      // Gallery entries — each its own entry with a suffixed id so the mosaic's
      // id-keyed spotlight addressing doesn't collide with the photo entry.
      if (config.includeGallery && config.galleryCount > 0) {
        // getPersonDir expects the raw DB shape (unresolved photo_path).
        const galleryDir = path.join(
          getPersonDir({ photoPath: r.photo_path, name: r.name }),
          "gallery"
        );
        if (fs.existsSync(galleryDir)) {
          let files: string[];
          try {
            files = fs
              .readdirSync(galleryDir)
              .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()));
          } catch {
            files = [];
          }
          const sampled = shuffle(files).slice(0, config.galleryCount);
          sampled.forEach((filename, index) => {
            entries.push({
              id: `${r.id}:g${index}`,
              personId: r.id,
              name: r.name,
              type: r.type,
              posterPath: stampPathFs(path.join(galleryDir, filename)),
              fanartPath: null,
              posterBlur: r.photo_blur,
              birthYear: r.birth_year,
              movieCount: r.movie_count,
              personalRating,
              isFavorite,
            });
          });
        }
      }
    }

    // 5. Shuffle the flat array, then truncate to the requested limit.
    const results = shuffle(entries).slice(0, limit);

    return NextResponse.json(results);
  } catch (error) {
    console.error("Hero wall people error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

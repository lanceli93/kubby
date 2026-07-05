import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { movies, userMovieData, userPreferences } from "@/lib/db/schema";
import { eq, sql, and, inArray, notInArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  HeroMosaicConfig,
  normalizeHeroMosaicConfig,
} from "@/lib/hero-mosaic-config";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
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

// Fisher–Yates in-place shuffle so libraries aren't grouped in the wall.
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Selects the same fields the /api/movies list (sort=random) branch returns. */
const heroWallSelect = {
  id: movies.id,
  title: movies.title,
  originalTitle: movies.originalTitle,
  sortName: movies.sortName,
  overview: movies.overview,
  tagline: movies.tagline,
  filePath: movies.filePath,
  folderPath: movies.folderPath,
  posterPath: movies.posterPath,
  posterMtime: movies.posterMtime,
  posterBlur: movies.posterBlur,
  fanartPath: movies.fanartPath,
  fanartMtime: movies.fanartMtime,
  communityRating: movies.communityRating,
  officialRating: movies.officialRating,
  runtimeMinutes: movies.runtimeMinutes,
  runtimeSeconds: movies.runtimeSeconds,
  premiereDate: movies.premiereDate,
  year: movies.year,
  genres: movies.genres,
  tags: movies.tags,
  studios: movies.studios,
  country: movies.country,
  tmdbId: movies.tmdbId,
  imdbId: movies.imdbId,
  videoWidth: movies.videoWidth,
  videoHeight: movies.videoHeight,
  videoCodec: movies.videoCodec,
  fileSize: movies.fileSize,
  mediaLibraryId: movies.mediaLibraryId,
  dateAdded: movies.dateAdded,
  isFavorite: userMovieData.isFavorite,
  isWatched: userMovieData.isPlayed,
  personalRating: userMovieData.personalRating,
} as const;

// GET /api/movies/hero-wall — movie pool for the home hero poster mosaic.
// Honors the user's saved HeroMosaicConfig (per-library weighted sampling +
// year/resolution/style filters), with query-param overrides for live preview.
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
      .select({ heroMosaicConfig: userPreferences.heroMosaicConfig })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .get();

    const savedConfig = normalizeHeroMosaicConfig(
      parseJsonSafe(prefRow?.heroMosaicConfig ?? null)
    );

    // 2. Apply query-param overrides (preferences preview). Absent params keep
    //    the saved value; a present-but-empty/"null" param clears the filter.
    const merged: HeroMosaicConfig = { ...savedConfig };

    const styleParam = searchParams.get("style");
    if (styleParam !== null) {
      merged.style = styleParam as HeroMosaicConfig["style"];
    }

    // For nullable numeric filters: present + empty/"null" → explicit null.
    const numberOverride = (name: string): number | null | undefined => {
      const raw = searchParams.get(name);
      if (raw === null) return undefined; // absent → use saved
      const trimmed = raw.trim();
      if (trimmed === "" || trimmed === "null") return null; // clear filter
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    };

    const yearFromOverride = numberOverride("yearFrom");
    if (yearFromOverride !== undefined) merged.yearFrom = yearFromOverride;
    const yearToOverride = numberOverride("yearTo");
    if (yearToOverride !== undefined) merged.yearTo = yearToOverride;
    const minWidthOverride = numberOverride("minWidth");
    if (minWidthOverride !== undefined) merged.minWidth = minWidthOverride;

    const weightsParam = searchParams.get("weights");
    if (weightsParam !== null) {
      merged.libraryWeights =
        (parseJsonSafe(weightsParam) as Record<string, number>) ?? {};
    }

    // Re-normalize the merged result once more.
    const config = normalizeHeroMosaicConfig(merged);

    const limitParam = searchParams.get("limit");
    const limit = Math.max(
      1,
      Math.min(120, parseInt(limitParam || "60", 10) || 60)
    );

    // 3. Build the shared filter conditions on `movies`.
    const filters = [];
    if (config.style === "poster") {
      filters.push(sql`${movies.posterPath} IS NOT NULL`);
    } else if (config.style === "fanart") {
      filters.push(sql`${movies.fanartPath} IS NOT NULL`);
    } else {
      // "both" → has at least one image
      filters.push(
        sql`(${movies.posterPath} IS NOT NULL OR ${movies.fanartPath} IS NOT NULL)`
      );
    }
    if (config.yearFrom !== null) {
      filters.push(sql`${movies.year} >= ${config.yearFrom}`);
    }
    if (config.yearTo !== null) {
      filters.push(sql`${movies.year} <= ${config.yearTo}`);
    }
    if (config.minWidth !== null) {
      filters.push(sql`${movies.videoWidth} >= ${config.minWidth}`);
    }

    const baseQuery = () =>
      db
        .select(heroWallSelect)
        .from(movies)
        .leftJoin(
          userMovieData,
          and(
            eq(userMovieData.movieId, movies.id),
            eq(userMovieData.userId, userId)
          )
        )
        .$dynamic();

    type HeroWallRow = Awaited<ReturnType<ReturnType<typeof baseQuery>["all"]>>[number];

    let rows: HeroWallRow[];

    const weightEntries = Object.entries(config.libraryWeights);

    if (weightEntries.length === 0) {
      // 4a. Default: single random sample across all libraries.
      rows = baseQuery()
        .where(and(...filters))
        .orderBy(sql`RANDOM()`)
        .limit(limit)
        .all() as HeroWallRow[];
    } else {
      // 4b. Weighted sampling. Libraries with weight 0 (or absent from the map)
      //     are excluded; only weight > 0 entries participate.
      const weighted = weightEntries.filter(([, w]) => w > 0);
      const weightedIds = weighted.map(([id]) => id);
      const totalWeight = weighted.reduce((sum, [, w]) => sum + w, 0);

      if (weightedIds.length === 0 || totalWeight <= 0) {
        return NextResponse.json([]);
      }

      // Proportional quotas with rounding-drift correction so they sum to limit.
      const quotas = weighted.map(([id, w]) => ({
        id,
        quota: Math.round((limit * w) / totalWeight),
      }));
      let drift = limit - quotas.reduce((sum, q) => sum + q.quota, 0);
      // Distribute leftover/excess one unit at a time across libraries.
      let idx = 0;
      while (drift !== 0 && quotas.length > 0) {
        const q = quotas[idx % quotas.length];
        if (drift > 0) {
          q.quota += 1;
          drift -= 1;
        } else if (q.quota > 0) {
          q.quota -= 1;
          drift += 1;
        }
        idx++;
      }

      const collected: HeroWallRow[] = [];
      const pickedIds = new Set<string>();

      for (const { id, quota } of quotas) {
        if (quota <= 0) continue;
        const libRows = baseQuery()
          .where(and(...filters, eq(movies.mediaLibraryId, id)))
          .orderBy(sql`RANDOM()`)
          .limit(quota)
          .all() as HeroWallRow[];
        for (const r of libRows) {
          collected.push(r);
          pickedIds.add(r.id as string);
        }
      }

      // Top up any shortfall from the weighted libraries as a whole.
      const shortfall = limit - collected.length;
      if (shortfall > 0) {
        const topUpConditions = [
          ...filters,
          inArray(movies.mediaLibraryId, weightedIds),
        ];
        if (pickedIds.size > 0) {
          topUpConditions.push(notInArray(movies.id, Array.from(pickedIds)));
        }
        const topUp = baseQuery()
          .where(and(...topUpConditions))
          .orderBy(sql`RANDOM()`)
          .limit(shortfall)
          .all() as HeroWallRow[];
        for (const r of topUp) collected.push(r);
      }

      rows = shuffle(collected);
    }

    // 5. Resolve relative paths to absolute + apply the list endpoint's defaults.
    const results = rows.map((r) => ({
      ...r,
      posterPath: stampPath(r.posterPath ? path.join(r.folderPath, r.posterPath) : null, r.posterMtime),
      posterBlur: r.posterBlur,
      fanartPath: stampPath(r.fanartPath ? path.join(r.folderPath, r.fanartPath) : null, r.fanartMtime),
      isFavorite: r.isFavorite ?? false,
      isWatched: r.isWatched ?? false,
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Hero wall movies error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

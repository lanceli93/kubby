import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { mediaLibraries, movies } from "@/lib/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { parseFolderPaths, serializeFolderPaths } from "@/lib/folder-paths";

// GET /api/libraries
export async function GET() {
  try {
    const rows = db
      .select({
        id: mediaLibraries.id,
        name: mediaLibraries.name,
        type: mediaLibraries.type,
        folderPath: mediaLibraries.folderPath,
        scraperEnabled: mediaLibraries.scraperEnabled,
        jellyfinCompat: mediaLibraries.jellyfinCompat,
        metadataLanguage: mediaLibraries.metadataLanguage,
        lastScannedAt: mediaLibraries.lastScannedAt,
        createdAt: mediaLibraries.createdAt,
        // Count the right table per domain: movies / photo_items / music_tracks.
        // (Kept aliased as movieCount so the shared ["libraries"] consumers don't churn.)
        movieCount: sql<number>`(
          CASE "media_libraries"."type"
            WHEN 'photo' THEN (SELECT COUNT(*) FROM photo_items WHERE library_id = "media_libraries"."id")
            WHEN 'music' THEN (SELECT COUNT(*) FROM music_tracks WHERE library_id = "media_libraries"."id")
            WHEN 'tvshow' THEN (SELECT COUNT(*) FROM tv_episodes WHERE show_id IN (SELECT id FROM tv_shows WHERE media_library_id = "media_libraries"."id"))
            ELSE (SELECT COUNT(*) FROM movies WHERE media_library_id = "media_libraries"."id")
          END
        )`,
      })
      .from(mediaLibraries)
      .all();

    // For each library, prefer poster.jpg in the first library folder; fall back to random fanart
    const libraries = rows.map((lib) => {
      const folderPaths = parseFolderPaths(lib.folderPath);
      const posterPath = path.join(folderPaths[0] ?? lib.folderPath, "poster.jpg");
      if (fs.existsSync(posterPath)) {
        return { ...lib, coverImage: posterPath, hasCustomCover: true };
      }

      const cover = db
        .select({
          coverImage: sql<string>`${movies.folderPath} || '/' || ${movies.fanartPath}`,
        })
        .from(movies)
        .where(
          and(
            eq(movies.mediaLibraryId, lib.id),
            sql`${movies.fanartPath} IS NOT NULL`
          )
        )
        .orderBy(sql`RANDOM()`)
        .limit(1)
        .get();

      return { ...lib, folderPaths, coverImage: cover?.coverImage ?? null, hasCustomCover: false };
    });

    return NextResponse.json(libraries);
  } catch (error) {
    console.error("List libraries error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/libraries
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type = "movie", folderPaths, folderPath, scraperEnabled = false, jellyfinCompat = false, metadataLanguage } = body;

    // Accept either folderPaths array or single folderPath (backward compat)
    const paths: string[] = Array.isArray(folderPaths) ? folderPaths : folderPath ? [folderPath] : [];

    if (!name || paths.length === 0) {
      return NextResponse.json(
        { error: "Name and at least one folder path are required" },
        { status: 400 }
      );
    }

    // Photo and music libraries have no scraper/NFO/metadata-language concept —
    // force these off regardless of what the request body sent.
    const isMetadataless = type === "photo" || type === "music";
    const finalScraperEnabled = isMetadataless ? false : !!scraperEnabled;
    const finalJellyfinCompat = isMetadataless ? false : !!jellyfinCompat;
    const finalMetadataLanguage = isMetadataless ? null : (metadataLanguage || null);

    const id = uuidv4();
    const serialized = serializeFolderPaths(paths);
    db.insert(mediaLibraries)
      .values({ id, name, type, folderPath: serialized, scraperEnabled: finalScraperEnabled, jellyfinCompat: finalJellyfinCompat, metadataLanguage: finalMetadataLanguage })
      .run();

    return NextResponse.json({ id, name, type, folderPath: serialized, folderPaths: paths, scraperEnabled: finalScraperEnabled, jellyfinCompat: finalJellyfinCompat, metadataLanguage: finalMetadataLanguage }, { status: 201 });
  } catch (error) {
    console.error("Create library error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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
        metadataLanguage: mediaLibraries.metadataLanguage,
        lastScannedAt: mediaLibraries.lastScannedAt,
        createdAt: mediaLibraries.createdAt,
        movieCount: sql<number>`(SELECT COUNT(*) FROM movies WHERE media_library_id = "media_libraries"."id")`,
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
    const { name, type = "movie", folderPaths, folderPath, scraperEnabled = false, metadataLanguage } = body;

    // Accept either folderPaths array or single folderPath (backward compat)
    const paths: string[] = Array.isArray(folderPaths) ? folderPaths : folderPath ? [folderPath] : [];

    if (!name || paths.length === 0) {
      return NextResponse.json(
        { error: "Name and at least one folder path are required" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const serialized = serializeFolderPaths(paths);
    db.insert(mediaLibraries)
      .values({ id, name, type, folderPath: serialized, scraperEnabled: !!scraperEnabled, metadataLanguage: metadataLanguage || null })
      .run();

    return NextResponse.json({ id, name, type, folderPath: serialized, folderPaths: paths, scraperEnabled: !!scraperEnabled, metadataLanguage: metadataLanguage || null }, { status: 201 });
  } catch (error) {
    console.error("Create library error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

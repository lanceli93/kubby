import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import fsPromises from "fs/promises";
import { db } from "@/lib/db";
import { mediaLibraries, movies, people, moviePeople } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { parseFolderPaths, serializeFolderPaths } from "@/lib/folder-paths";
import { getPersonDir } from "@/lib/person-utils";
import { getPhotoThumbsDir, getMusicArtDir } from "@/lib/paths";
import { pruneOrphanArtists } from "@/lib/music/mutations";

// GET /api/libraries/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const library = db
      .select({
        id: mediaLibraries.id,
        name: mediaLibraries.name,
        type: mediaLibraries.type,
        folderPath: mediaLibraries.folderPath,
        scraperEnabled: mediaLibraries.scraperEnabled,
        jellyfinCompat: mediaLibraries.jellyfinCompat,
        metadataLanguage: mediaLibraries.metadataLanguage,
        lastScannedAt: mediaLibraries.lastScannedAt,
        // Count the right table per domain: movies / photo_items / music_tracks.
        movieCount: sql<number>`(
          CASE "media_libraries"."type"
            WHEN 'photo' THEN (SELECT COUNT(*) FROM photo_items WHERE library_id = "media_libraries"."id")
            WHEN 'music' THEN (SELECT COUNT(*) FROM music_tracks WHERE library_id = "media_libraries"."id")
            ELSE (SELECT COUNT(*) FROM movies WHERE media_library_id = "media_libraries"."id")
          END
        )`,
      })
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, id))
      .get();

    if (!library) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...library,
      folderPaths: parseFolderPaths(library.folderPath),
    });
  } catch (error) {
    console.error("Get library error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/libraries/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { name, folderPaths, folderPath, scraperEnabled, jellyfinCompat, metadataLanguage } = body;

    const existing = db
      .select()
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, id))
      .get();

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (Array.isArray(folderPaths)) {
      updates.folderPath = serializeFolderPaths(folderPaths);
    } else if (folderPath !== undefined) {
      updates.folderPath = folderPath;
    }

    // Photo and music libraries have no scraper/NFO/metadata-language concept —
    // force these off regardless of what the request body sent, no matter the
    // existing stored type.
    const isMetadataless = existing.type === "photo" || existing.type === "music";
    if (isMetadataless) {
      updates.scraperEnabled = false;
      updates.jellyfinCompat = false;
      updates.metadataLanguage = null;
    } else {
      if (scraperEnabled !== undefined) updates.scraperEnabled = scraperEnabled;
      if (jellyfinCompat !== undefined) updates.jellyfinCompat = jellyfinCompat;
      if (metadataLanguage !== undefined) updates.metadataLanguage = metadataLanguage || null;
    }

    if (Object.keys(updates).length > 0) {
      db.update(mediaLibraries)
        .set(updates)
        .where(eq(mediaLibraries.id, id))
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update library error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/libraries/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cleanupOrphans = request.nextUrl.searchParams.get("cleanupOrphans") === "true";
  const deleteNfo = request.nextUrl.searchParams.get("deleteNfo") === "true";

  try {
    // Read the library type BEFORE deletion — the FK cascade wipes its rows,
    // and per-domain on-disk cleanup below depends on knowing the type.
    const lib = db
      .select({ type: mediaLibraries.type })
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, id))
      .get();
    if (!lib) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Collect NFO paths BEFORE cascade-deleting movies (movie domain only)
    let nfoPaths: { folderPath: string; nfoPath: string | null }[] = [];
    if (deleteNfo && lib.type === "movie") {
      nfoPaths = db
        .select({ folderPath: movies.folderPath, nfoPath: movies.nfoPath })
        .from(movies)
        .where(eq(movies.mediaLibraryId, id))
        .all();
    }

    // Delete the library. FK cascade removes the domain's DB rows:
    // movies+moviePeople / photo_items+photo_albums / music_tracks+music_albums.
    db.delete(mediaLibraries).where(eq(mediaLibraries.id, id)).run();

    // Per-domain on-disk artifact cleanup. The cascade only touches the DB;
    // library-scoped generated media dirs must be removed here or they orphan.
    if (lib.type === "photo") {
      // metadata/photo-thumbs/{libraryId}/ — generated thumbnails + previews.
      await fsPromises
        .rm(nodePath.join(getPhotoThumbsDir(), id), { recursive: true, force: true })
        .catch(() => {});
    } else if (lib.type === "music") {
      // metadata/music-art/{libraryId}/ — extracted embedded cover art.
      await fsPromises
        .rm(nodePath.join(getMusicArtDir(), id), { recursive: true, force: true })
        .catch(() => {});
      // The cascade already dropped this library's tracks/albums + their join
      // rows, but music_artists are GLOBAL (no FK to the library). Sweep away
      // any artist left with no remaining album/track links — mirrors the
      // album/track DELETE routes. (No pruneEmptyAlbums: albums were cascade-
      // deleted with the library, so none remain for it to find.)
      pruneOrphanArtists();
    }

    // Delete NFO files from media folders (movie domain only)
    if (deleteNfo && lib.type === "movie") {
      for (const m of nfoPaths) {
        if (!m.nfoPath) continue;
        const fullPath = nodePath.join(m.folderPath, m.nfoPath);
        try {
          await fsPromises.rm(fullPath, { force: true });
        } catch {
          // ignore
        }
      }
    }

    // Clean up orphan people (no remaining moviePeople associations).
    // People belong to the cinema domain — this must never run for a photo or
    // music library (cleanupOrphans is GLOBAL: it would delete actors across
    // ALL cinema libraries, an out-of-domain side effect).
    if (cleanupOrphans && lib.type === "movie") {
      // Find people with no movie associations (orphans)
      const orphans = db
        .select({ id: people.id, name: people.name, photoPath: people.photoPath })
        .from(people)
        .where(
          sql`${people.id} NOT IN (SELECT DISTINCT ${moviePeople.personId} FROM ${moviePeople})`
        )
        .all();

      // Delete orphan photo directories
      for (const orphan of orphans) {
        const personDir = getPersonDir(orphan);
        try {
          await fsPromises.rm(personDir, { recursive: true, force: true });
        } catch {
          // ignore fs errors
        }
      }

      // Delete orphan DB records
      if (orphans.length > 0) {
        db.run(
          sql`DELETE FROM ${people} WHERE ${people.id} NOT IN (SELECT DISTINCT ${moviePeople.personId} FROM ${moviePeople})`
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete library error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import fsPromises from "fs/promises";
import { db } from "@/lib/db";
import { mediaLibraries, movies, people, moviePeople } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { parseFolderPaths, serializeFolderPaths } from "@/lib/folder-paths";
import { getPersonDir } from "@/lib/person-utils";

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
        movieCount: sql<number>`(SELECT COUNT(*) FROM movies WHERE media_library_id = "media_libraries"."id")`,
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
    if (scraperEnabled !== undefined) updates.scraperEnabled = scraperEnabled;
    if (jellyfinCompat !== undefined) updates.jellyfinCompat = jellyfinCompat;
    if (metadataLanguage !== undefined) updates.metadataLanguage = metadataLanguage || null;

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
    // Collect NFO paths BEFORE cascade-deleting movies
    let nfoPaths: { folderPath: string; nfoPath: string | null }[] = [];
    if (deleteNfo) {
      nfoPaths = db
        .select({ folderPath: movies.folderPath, nfoPath: movies.nfoPath })
        .from(movies)
        .where(eq(movies.mediaLibraryId, id))
        .all();
    }

    // Delete the library (movies + moviePeople cascade-delete via FK)
    db.delete(mediaLibraries).where(eq(mediaLibraries.id, id)).run();

    // Delete NFO files from media folders
    if (deleteNfo) {
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

    // Clean up orphan people (no remaining moviePeople associations)
    if (cleanupOrphans) {
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

import nodePath from "path";
import fsPromises from "fs/promises";
import { db } from "@/lib/db";
import { mediaLibraries, movies, people, moviePeople, tvPeople, tvShowPeople } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getPersonDir } from "@/lib/person-utils";
import { getPhotoThumbsDir, getMusicArtDir, getTvPeopleMetadataDir, resolveDataPath, getPeopleMetadataDir, isPathInside } from "@/lib/paths";
import { sanitizePersonName } from "@/lib/tmdb";
import { pruneOrphanArtists } from "@/lib/music/mutations";

// Resolve a tv_people row's on-disk photo directory. Mirrors getPersonDir for
// the cinema `people` table, but rooted at metadata/tv-people/ so the TV sweep
// never touches cinema person dirs. (tv_people is isolated from cinema people.)
function getTvPersonDir(person: { photoPath: string | null; name: string }): string {
  if (person.photoPath) {
    return nodePath.dirname(resolveDataPath(person.photoPath));
  }
  const sanitized = sanitizePersonName(person.name);
  const firstLetter = sanitized.charAt(0).toUpperCase() || "_";
  return nodePath.join(getTvPeopleMetadataDir(), firstLetter, sanitized);
}

export interface DeleteLibraryOptions {
  /** Sweep cinema/TV people left with no associations (domain-scoped). */
  cleanupOrphans?: boolean;
  /** Also delete the movies' .nfo files from the media folders (movie domain only). */
  deleteNfo?: boolean;
}

// Full per-library teardown: FK-cascade the DB rows, then remove the domain's
// on-disk artifacts and (optionally) orphaned people. No auth check — callers
// (the DELETE /api/libraries/[id] handler, demo teardown) guard before calling.
// Returns false if the library doesn't exist.
export async function deleteLibraryById(id: string, opts: DeleteLibraryOptions = {}): Promise<boolean> {
  const { cleanupOrphans = false, deleteNfo = false } = opts;
  // Read the library type BEFORE deletion — the FK cascade wipes its rows,
  // and per-domain on-disk cleanup below depends on knowing the type.
  const lib = db
    .select({ type: mediaLibraries.type })
    .from(mediaLibraries)
    .where(eq(mediaLibraries.id, id))
    .get();
  if (!lib) return false;

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
      // photo_path may come from an NFO and point outside our metadata dir —
      // never recursively delete anything we don't own.
      if (!isPathInside(personDir, getPeopleMetadataDir())) continue;
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

  // Clean up orphan TV people (no remaining tvShowPeople associations).
  // tv_people is ISOLATED from cinema people — this branch touches ONLY the
  // TV tables and must never run for a non-tvshow library. Mirrors the movie
  // sweep above against the parallel TV tables.
  if (cleanupOrphans && lib.type === "tvshow") {
    // Find TV people with no show associations (orphans)
    const orphans = db
      .select({ id: tvPeople.id, name: tvPeople.name, photoPath: tvPeople.photoPath })
      .from(tvPeople)
      .where(
        sql`${tvPeople.id} NOT IN (SELECT DISTINCT ${tvShowPeople.personId} FROM ${tvShowPeople})`
      )
      .all();

    // Delete orphan photo directories (under metadata/tv-people/)
    for (const orphan of orphans) {
      const personDir = getTvPersonDir(orphan);
      if (!isPathInside(personDir, getTvPeopleMetadataDir())) continue;
      try {
        await fsPromises.rm(personDir, { recursive: true, force: true });
      } catch {
        // ignore fs errors
      }
    }

    // Delete orphan DB records
    if (orphans.length > 0) {
      db.run(
        sql`DELETE FROM ${tvPeople} WHERE ${tvPeople.id} NOT IN (SELECT DISTINCT ${tvShowPeople.personId} FROM ${tvShowPeople})`
      );
    }
  }

  return true;
}

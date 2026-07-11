import fs from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import {
  musicAlbumArtists,
  musicAlbums,
  musicArtists,
  musicTrackArtists,
  musicTracks,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getMusicArtDir } from "@/lib/paths";

/**
 * Server-side music mutation helpers — shared by the album/track/artist DELETE
 * and PUT routes so pruning + on-disk cleanup stay consistent.
 *
 * Cross-domain safety: everything here is scoped to the music domain only.
 */

/** Delete a single source file, swallowing errors (best-effort). */
export async function deleteFileQuiet(filePath: string): Promise<void> {
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // ignore — a missing/locked file must not fail the request
  }
}

/**
 * Remove an album's GENERATED embedded cover art under
 * `metadata/music-art/{libraryId}/{albumId}.{ext}`. This is a Kubby artifact,
 * NOT the user's file, so it's always safe to remove on album deletion. Folder
 * cover images (which live in the user's library folder) are left alone here.
 */
export async function removeAlbumCoverArt(libraryId: string, albumId: string): Promise<void> {
  const dir = path.join(getMusicArtDir(), libraryId);
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    await deleteFileQuiet(path.join(dir, albumId + ext));
  }
}

/**
 * If the containing folder is now empty, remove it (cleans up an album folder
 * left behind after its audio files were deleted). Best-effort; never throws.
 */
export async function removeDirIfEmpty(dir: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir);
    if (entries.length === 0) await fs.rmdir(dir);
  } catch {
    // not empty / not removable — leave it
  }
}

/** Delete an album whose tracks are already gone: DB row + generated cover art. */
export async function deleteEmptyAlbum(albumId: string, libraryId: string): Promise<void> {
  db.delete(musicAlbums).where(eq(musicAlbums.id, albumId)).run();
  await removeAlbumCoverArt(libraryId, albumId);
}

/**
 * Delete albums in this library that no longer have any tracks (after a track
 * or bulk deletion). Returns the ids removed.
 */
export async function pruneEmptyAlbums(libraryId: string): Promise<string[]> {
  const albums = db
    .select({ id: musicAlbums.id })
    .from(musicAlbums)
    .where(eq(musicAlbums.libraryId, libraryId))
    .all();
  const removed: string[] = [];
  for (const album of albums) {
    const hasTrack = db
      .select({ id: musicTracks.id })
      .from(musicTracks)
      .where(eq(musicTracks.albumId, album.id))
      .get();
    if (!hasTrack) {
      await deleteEmptyAlbum(album.id, libraryId);
      removed.push(album.id);
    }
  }
  return removed;
}

/**
 * Delete artists referenced by neither an album nor a track. Artists are
 * global, so this scans all artists (mirrors the scanner's orphan sweep).
 */
export function pruneOrphanArtists(): void {
  const artists = db.select({ id: musicArtists.id }).from(musicArtists).all();
  for (const artist of artists) {
    const albumRef = db
      .select({ artistId: musicAlbumArtists.artistId })
      .from(musicAlbumArtists)
      .where(eq(musicAlbumArtists.artistId, artist.id))
      .get();
    if (albumRef) continue;
    const trackRef = db
      .select({ artistId: musicTrackArtists.artistId })
      .from(musicTrackArtists)
      .where(eq(musicTrackArtists.artistId, artist.id))
      .get();
    if (trackRef) continue;
    db.delete(musicArtists).where(eq(musicArtists.id, artist.id)).run();
  }
}

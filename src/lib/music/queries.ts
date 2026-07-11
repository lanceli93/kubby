import { db } from "@/lib/db";
import {
  musicAlbumArtists,
  musicArtists,
  musicTrackArtists,
  musicTracks,
} from "@/lib/db/schema";
import { asc, eq, inArray, sql } from "drizzle-orm";

/**
 * Batch-fetch album-artist display names for a set of album ids.
 * Joins music_album_artists → music_artists, groups per album and joins the
 * names with ", ". Returns a Map<albumId, artistName>; albums with no linked
 * artist are simply absent (callers fall back to "").
 *
 * Uses a single grouped query (GROUP_CONCAT) — no per-album N+1.
 */
export function getAlbumArtistNames(albumIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  if (albumIds.length === 0) return map;

  const rows = db
    .select({
      albumId: musicAlbumArtists.albumId,
      // group_concat preserves insertion order well enough for a display string.
      artistName: sql<string>`group_concat(${musicArtists.name}, ', ')`,
    })
    .from(musicAlbumArtists)
    .innerJoin(musicArtists, eq(musicArtists.id, musicAlbumArtists.artistId))
    .where(inArray(musicAlbumArtists.albumId, albumIds))
    .groupBy(musicAlbumArtists.albumId)
    .all();

  for (const row of rows) {
    if (row.artistName) map.set(row.albumId, row.artistName);
  }
  return map;
}

/**
 * Batch-fetch track-artist display names for a set of track ids.
 * Same shape/idea as getAlbumArtistNames but over music_track_artists.
 */
export function getTrackArtistNames(trackIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  if (trackIds.length === 0) return map;

  const rows = db
    .select({
      trackId: musicTrackArtists.trackId,
      artistName: sql<string>`group_concat(${musicArtists.name}, ', ')`,
    })
    .from(musicTrackArtists)
    .innerJoin(musicArtists, eq(musicArtists.id, musicTrackArtists.artistId))
    .where(inArray(musicTrackArtists.trackId, trackIds))
    .groupBy(musicTrackArtists.trackId)
    .all();

  for (const row of rows) {
    if (row.artistName) map.set(row.trackId, row.artistName);
  }
  return map;
}

/**
 * Batch-fetch track counts for a set of album ids (music_tracks per albumId).
 * Returns a Map<albumId, count>; albums with no tracks are absent (callers
 * fall back to 0).
 */
export function getAlbumTrackCounts(albumIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  if (albumIds.length === 0) return map;

  const rows = db
    .select({
      albumId: musicTracks.albumId,
      trackCount: sql<number>`count(*)`,
    })
    .from(musicTracks)
    .where(inArray(musicTracks.albumId, albumIds))
    .groupBy(musicTracks.albumId)
    .all();

  for (const row of rows) {
    if (row.albumId) map.set(row.albumId, row.trackCount);
  }
  return map;
}

/**
 * Ordering helper for album tracks: discNumber asc (nulls/0 first) then
 * trackNumber asc (nulls last). Reused by album detail.
 */
export const albumTrackOrder = [
  sql`COALESCE(${musicTracks.discNumber}, 0) ASC`,
  sql`COALESCE(${musicTracks.trackNumber}, 999999) ASC`,
  asc(musicTracks.title),
];

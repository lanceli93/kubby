import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { parseFile } from "music-metadata";
import { db } from "@/lib/db";
import {
  mediaLibraries,
  musicArtists,
  musicAlbums,
  musicAlbumArtists,
  musicTracks,
  musicTrackArtists,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { parseFolderPaths } from "@/lib/folder-paths";
import { getMusicArtDir } from "@/lib/paths";
import { generateBlurDataURL } from "@/lib/blur-utils";
import { extractLyricsFromCommon, readLrcSidecar } from "@/lib/music/lyrics";
import type { ScanProgress, SkippedFolder } from "./index";

// ─── Constants ─────────────────────────────────────────────────

const AUDIO_EXTENSIONS = [
  ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus",
  ".wav", ".wma", ".aiff", ".aif", ".alac",
];

// Album folder images to look for, in priority order (base name, any ext below).
const COVER_BASENAMES = ["cover", "folder", "albumart", "front"];
const COVER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

// Junk directories to skip (NAS thumbnails, recycle bins, cache dirs).
const SKIP_DIRS = new Set(["@eaDir", "#recycle", ".thumbnails"]);

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".wav": "audio/wav",
  ".wma": "audio/x-ms-wma",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
  ".alac": "audio/mp4",
};

// Map an embedded picture MIME type to a file extension.
const PICTURE_EXT_BY_FORMAT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const UNKNOWN_ARTIST = "Unknown Artist";

type MusicLibrary = typeof mediaLibraries.$inferSelect;
type TrackRow = typeof musicTracks.$inferSelect;

// ─── Filesystem walk ───────────────────────────────────────────

interface WalkedFile {
  fullPath: string;
  /** Absolute directory containing the file — used for cover lookup + grouping fallback. */
  dir: string;
}

/**
 * Recursively collect audio files under a library root, skipping dotfiles,
 * dot-directories and common junk dirs (@eaDir, #recycle, …).
 */
function walkLibrary(root: string): WalkedFile[] {
  const results: WalkedFile[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      console.warn(`Failed to read directory ${dir}:`, (e as Error).message);
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith(".")) continue; // dotfile / dot-directory
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(path.join(dir, name));
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(name).toLowerCase();
      if (!AUDIO_EXTENSIONS.includes(ext)) continue;
      const fullPath = path.join(dir, name);
      results.push({ fullPath, dir });
    }
  }

  walk(root);
  return results;
}

// ─── Small concurrency pool (no new dependency) ────────────────

async function runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const next = async (): Promise<void> => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]);
    }
  };
  for (let i = 0; i < Math.min(size, items.length); i++) {
    runners.push(next());
  }
  await Promise.all(runners);
}

// ─── Artist resolution (global, case-insensitive) ──────────────

/**
 * Case-insensitive lookup of an artist by name; inserts a row if missing.
 * Artists are global (not library-scoped). Returns the artist id.
 */
function getOrCreateArtist(name: string): string {
  const lookup = name.trim() || UNKNOWN_ARTIST;
  // Case-insensitive match via lower() so mixed-case tags don't duplicate artists.
  const existing = db
    .select({ id: musicArtists.id })
    .from(musicArtists)
    .where(sql`lower(${musicArtists.name}) = lower(${lookup})`)
    .get();
  if (existing) return existing.id;

  const id = uuidv4();
  try {
    db.insert(musicArtists).values({ id, name: lookup, sortName: lookup }).run();
    return id;
  } catch {
    // Unique-name collision (race or case-variant already inserted) — re-query.
    const row = db
      .select({ id: musicArtists.id })
      .from(musicArtists)
      .where(sql`lower(${musicArtists.name}) = lower(${lookup})`)
      .get();
    if (row) return row.id;
    throw new Error(`Failed to resolve artist "${lookup}"`);
  }
}

// ─── Cover art resolution ──────────────────────────────────────

/** Find an album-folder cover image (cover / folder / albumart / front + jpg/png/webp). */
function findFolderCover(dir: string): string | null {
  for (const base of COVER_BASENAMES) {
    for (const ext of COVER_EXTENSIONS) {
      const candidate = path.join(dir, base + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Resolve a cover for an album and persist coverPath + coverBlur.
 * Priority: album-folder image > embedded picture > none.
 * coverPath is stored as an ABSOLUTE filesystem path for both cases so
 * `/api/images` (which reads by absolute path) serves it uniformly.
 */
async function resolveAlbumCover(
  libraryId: string,
  albumId: string,
  folderDir: string,
  picture: { format: string; data: Uint8Array } | undefined,
): Promise<void> {
  let coverAbsPath: string | null = null;

  const folderCover = findFolderCover(folderDir);
  if (folderCover) {
    coverAbsPath = folderCover;
  } else if (picture) {
    const ext = PICTURE_EXT_BY_FORMAT[picture.format.toLowerCase()] ?? ".jpg";
    const artDir = path.join(getMusicArtDir(), libraryId);
    try {
      fs.mkdirSync(artDir, { recursive: true });
      const dest = path.join(artDir, albumId + ext);
      fs.writeFileSync(dest, Buffer.from(picture.data));
      coverAbsPath = dest;
    } catch (e) {
      console.warn(`Failed to write embedded cover for album ${albumId}:`, (e as Error).message);
    }
  }

  if (!coverAbsPath) return;

  const coverBlur = await generateBlurDataURL(coverAbsPath);
  db.update(musicAlbums)
    .set({ coverPath: coverAbsPath, coverBlur })
    .where(eq(musicAlbums.id, albumId))
    .run();
}

// ─── Album resolution ──────────────────────────────────────────

/** One grouping candidate: an album id + the artist ids accumulated for it. */
interface AlbumCandidate {
  albumId: string;
  artistIds: Set<string>;
}
/** Lowercased album title → candidates sharing that title. */
type AlbumCache = Map<string, AlbumCandidate[]>;

/**
 * Find or create an album for this scan run. Grouping rule (matches the user's
 * intent): **same album title (case-insensitive) + shares ≥1 artist**, where
 * "artist" means any album-artist OR track-artist of a member track — so a
 * compilation whose tracks have differing per-track artists still collapses to
 * ONE album as long as its tracks chain together through a shared artist.
 *
 * The in-memory cache does the matching (a title can hold several genuinely
 * distinct same-name albums by different artists); the DB is consulted only to
 * seed candidates on the first encounter of a title in this run, so reruns
 * don't duplicate. `groupArtistIds` is the union of album- and track-artist ids
 * for THIS track — used both for the intersection test and to widen the
 * candidate's set so later tracks can chain in. Album-artist join rows are
 * inserted (guarded) for the album's own album-artists.
 */
function getOrCreateAlbum(
  cache: AlbumCache,
  libraryId: string,
  title: string,
  albumArtistIds: string[],
  groupArtistIds: string[],
  year: number | null,
  genreArray: string[],
  folderDir: string,
): string {
  const titleKey = title.toLowerCase();
  let candidates = cache.get(titleKey);

  // First time we see this title in the run: seed candidates from the DB (title
  // scoped to the library) with each existing album's linked artist set.
  if (!candidates) {
    candidates = [];
    const dbAlbums = db
      .select({ id: musicAlbums.id })
      .from(musicAlbums)
      .where(sql`${musicAlbums.libraryId} = ${libraryId} and lower(${musicAlbums.title}) = lower(${title})`)
      .all();
    for (const a of dbAlbums) {
      const albumArtistRows = db
        .select({ artistId: musicAlbumArtists.artistId })
        .from(musicAlbumArtists)
        .where(eq(musicAlbumArtists.albumId, a.id))
        .all();
      const trackArtistRows = db
        .select({ artistId: musicTrackArtists.artistId })
        .from(musicTrackArtists)
        .innerJoin(musicTracks, eq(musicTracks.id, musicTrackArtists.trackId))
        .where(eq(musicTracks.albumId, a.id))
        .all();
      const artistIds = new Set<string>([
        ...albumArtistRows.map((r) => r.artistId),
        ...trackArtistRows.map((r) => r.artistId),
      ]);
      candidates.push({ albumId: a.id, artistIds });
    }
    cache.set(titleKey, candidates);
  }

  // Reuse the first candidate that shares ≥1 artist with this track.
  const match = candidates.find((c) => groupArtistIds.some((id) => c.artistIds.has(id)));
  if (match) {
    for (const id of groupArtistIds) match.artistIds.add(id);
    ensureAlbumArtists(match.albumId, albumArtistIds);
    return match.albumId;
  }

  const albumId = uuidv4();
  db.insert(musicAlbums)
    .values({
      id: albumId,
      libraryId,
      title,
      sortTitle: title,
      year,
      genres: JSON.stringify(genreArray),
      folderPath: folderDir,
    })
    .run();
  ensureAlbumArtists(albumId, albumArtistIds);
  candidates.push({ albumId, artistIds: new Set(groupArtistIds) });
  return albumId;
}

/** Insert album-artist join rows, ignoring duplicates (guards the unique index). */
function ensureAlbumArtists(albumId: string, artistIds: string[]) {
  for (const artistId of artistIds) {
    const existing = db
      .select({ artistId: musicAlbumArtists.artistId })
      .from(musicAlbumArtists)
      .where(eq(musicAlbumArtists.albumId, albumId))
      .all();
    if (existing.some((e) => e.artistId === artistId)) continue;
    try {
      db.insert(musicAlbumArtists).values({ albumId, artistId }).run();
    } catch {
      // Unique-index collision (race) — safe to ignore.
    }
  }
}

// ─── Track-artist join ─────────────────────────────────────────

/** Insert track-artist join rows, ignoring duplicates (guards the unique index). */
function ensureTrackArtists(trackId: string, artistIds: string[]) {
  const seen = new Set<string>();
  for (const artistId of artistIds) {
    if (seen.has(artistId)) continue;
    seen.add(artistId);
    try {
      db.insert(musicTrackArtists).values({ trackId, artistId }).run();
    } catch {
      // Unique-index collision (already linked) — safe to ignore.
    }
  }
}

// ─── Entry point ───────────────────────────────────────────────

export async function scanMusicLibrary(
  library: MusicLibrary,
  onProgress?: (progress: ScanProgress) => void
): Promise<{ scannedCount: number; removedCount: number; skipped: SkippedFolder[] }> {
  const folderPaths = parseFolderPaths(library.folderPath);
  if (folderPaths.length === 0) {
    throw new Error("Library has no folder paths configured");
  }

  const validPaths = folderPaths.filter((p) => {
    if (!fs.existsSync(p)) {
      console.warn(`Library path does not exist, skipping: ${p}`);
      return false;
    }
    return true;
  });

  if (validPaths.length === 0) {
    throw new Error(`No valid library paths found. Checked: ${folderPaths.join(", ")}`);
  }

  // 1-2. Walk all roots and collect candidate audio files.
  const files: WalkedFile[] = [];
  for (const root of validPaths) {
    files.push(...walkLibrary(root));
  }
  console.log(`Music scan: found ${files.length} audio files in library ${library.id}`);

  // Load existing track rows keyed by absolute filePath.
  const existingRows = db
    .select()
    .from(musicTracks)
    .where(eq(musicTracks.libraryId, library.id))
    .all();
  const rowByPath = new Map<string, TrackRow>();
  for (const row of existingRows) rowByPath.set(row.filePath, row);

  const seenPaths = new Set<string>();
  let scannedCount = 0;

  // Partition into unchanged (skip) vs new/changed (process).
  const toProcess: { file: WalkedFile; stat: fs.Stats; existing: TrackRow | undefined }[] = [];
  for (const file of files) {
    seenPaths.add(file.fullPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file.fullPath);
    } catch (e) {
      console.warn(`Failed to stat ${file.fullPath}:`, (e as Error).message);
      continue;
    }
    const existing = rowByPath.get(file.fullPath);
    if (existing && existing.dateModified === Math.floor(stat.mtimeMs) && existing.fileSize === stat.size) {
      scannedCount++; // unchanged — counts as scanned
      continue;
    }
    toProcess.push({ file, stat, existing });
  }

  // In-memory album grouping cache for this run. Keyed by the LOWERCASED album
  // title; each title maps to the candidate albums seen so far with the set of
  // artist ids (album-artists ∪ track-artists) accumulated for each. Grouping
  // rule: "same title + shares ≥1 artist" (see getOrCreateAlbum).
  const albumCache: AlbumCache = new Map();

  // NOTE: process serially (pool size 1) — album/artist resolution reads &
  // writes shared tables, and better-sqlite3 calls are synchronous, so a wider
  // pool would interleave writes and risk duplicate albums/artists. The pool
  // helper is kept to mirror the photo scanner's shape.
  let processedIdx = 0;
  const total = toProcess.length;
  let lastPctBucket = -1;

  await runPool(toProcess, 1, async ({ file, stat, existing }) => {
    try {
      const md = await parseFile(file.fullPath);
      const common = md.common;
      const format = md.format;
      const ext = path.extname(file.fullPath).toLowerCase();

      const title = (common.title && common.title.trim()) || path.basename(file.fullPath, ext);
      const albumTitle = common.album && common.album.trim() ? common.album.trim() : null;
      const genreArray = Array.isArray(common.genre) ? common.genre.filter(Boolean) : [];
      const year = typeof common.year === "number" ? common.year : null;

      // Album-artist name(s): prefer albumartist, else first track artist, else Unknown.
      const albumArtistName =
        (common.albumartist && common.albumartist.trim()) ||
        (common.artist && common.artist.trim()) ||
        UNKNOWN_ARTIST;

      // Track artist name(s): the array music-metadata gives, else the single string.
      const trackArtistNames =
        Array.isArray(common.artists) && common.artists.length > 0
          ? common.artists.filter((a) => a && a.trim())
          : common.artist && common.artist.trim()
            ? [common.artist.trim()]
            : [UNKNOWN_ARTIST];

      // Ensure every distinct artist has a row.
      const albumArtistIds = [getOrCreateArtist(albumArtistName)];
      const trackArtistIds = trackArtistNames.map((n) => getOrCreateArtist(n));

      // Album grouping — no album tag → albumId null (unknown-album track).
      // "shares ≥1 artist" tests against the union of album- and track-artists,
      // so compilations chain together even when per-track artists differ.
      const groupArtistIds = Array.from(new Set([...albumArtistIds, ...trackArtistIds]));
      let albumId: string | null = null;
      let albumWasNew = false;
      if (albumTitle) {
        albumId = getOrCreateAlbum(
          albumCache,
          library.id,
          albumTitle,
          albumArtistIds,
          groupArtistIds,
          year,
          genreArray,
          file.dir,
        );
        // "New" = this album currently has no persisted tracks yet (first track
        // of the run to land on it), so we know to (re)resolve its cover below.
        albumWasNew = !db
          .select({ id: musicTracks.id })
          .from(musicTracks)
          .where(eq(musicTracks.albumId, albumId))
          .get();
      }

      // Cover art: once per album, when just created OR the album still has no cover.
      if (albumId) {
        const albumRow = db
          .select({ coverPath: musicAlbums.coverPath })
          .from(musicAlbums)
          .where(eq(musicAlbums.id, albumId))
          .get();
        if (albumWasNew || !albumRow?.coverPath) {
          await resolveAlbumCover(library.id, albumId, file.dir, common.picture?.[0]);
        }
      }

      // Lyrics: `.lrc` sidecar (synced, authoritative) then embedded tags.
      const lyrics = readLrcSidecar(file.fullPath) ?? extractLyricsFromCommon(common);

      const trackId = existing?.id || uuidv4();
      const values: typeof musicTracks.$inferInsert = {
        id: trackId,
        libraryId: library.id,
        albumId,
        filePath: file.fullPath,
        fileName: path.basename(file.fullPath),
        title,
        sortTitle: title,
        trackNumber: common.track?.no ?? null,
        discNumber: common.disk?.no ?? null,
        durationSeconds: format.duration ?? null,
        codec: format.codec ?? null,
        bitrate: format.bitrate != null ? Math.round(format.bitrate) : null,
        sampleRate: format.sampleRate ?? null,
        channels: format.numberOfChannels ?? null,
        fileSize: stat.size,
        genres: JSON.stringify(genreArray),
        year,
        lyricsPath: null,
        lyrics,
        mimeType: MIME_BY_EXT[ext] ?? null,
        dateModified: Math.floor(stat.mtimeMs),
      };

      if (existing) {
        db.update(musicTracks).set(values).where(eq(musicTracks.id, trackId)).run();
        // Re-derive track-artist links from scratch.
        db.delete(musicTrackArtists).where(eq(musicTrackArtists.trackId, trackId)).run();
      } else {
        db.insert(musicTracks).values(values).run();
      }
      ensureTrackArtists(trackId, trackArtistIds);
      scannedCount++;
    } catch (e) {
      console.warn(`Failed to process audio file ${file.fullPath}:`, (e as Error).message);
      // Skip this file — not counted as scanned.
    } finally {
      const cur = ++processedIdx;
      if (onProgress && total > 0) {
        const curPctBucket = Math.floor((cur / total) * 20); // 0-20 → 5% steps
        if (cur === 1 || cur === total || curPctBucket > lastPctBucket) {
          onProgress({ current: cur, total, title: path.basename(file.fullPath) });
          lastPctBucket = curPctBucket;
        }
      }
    }
  });

  // ─── Cleanup ──────────────────────────────────────────────────
  let removedCount = 0;

  // 1. Tracks whose files vanished. FK cascade removes their track-artist rows.
  for (const row of existingRows) {
    if (!seenPaths.has(row.filePath)) {
      db.delete(musicTracks).where(eq(musicTracks.id, row.id)).run();
      removedCount++;
    }
  }
  if (removedCount > 0) {
    console.log(`Removed ${removedCount} music tracks no longer found on disk`);
  }

  // 2. Albums in this library with zero tracks. Cascade cleans album-artist rows.
  const albumsInLib = db
    .select({ id: musicAlbums.id })
    .from(musicAlbums)
    .where(eq(musicAlbums.libraryId, library.id))
    .all();
  for (const album of albumsInLib) {
    const trackCount = db
      .select({ id: musicTracks.id })
      .from(musicTracks)
      .where(eq(musicTracks.albumId, album.id))
      .all().length;
    if (trackCount === 0) {
      db.delete(musicAlbums).where(eq(musicAlbums.id, album.id)).run();
    }
  }

  // 3. Orphan artists — referenced by neither album-artists nor track-artists.
  // Artists are global; only delete truly orphaned ones.
  const allArtists = db.select({ id: musicArtists.id }).from(musicArtists).all();
  for (const artist of allArtists) {
    const albumRefs = db
      .select({ artistId: musicAlbumArtists.artistId })
      .from(musicAlbumArtists)
      .where(eq(musicAlbumArtists.artistId, artist.id))
      .all().length;
    if (albumRefs > 0) continue;
    const trackRefs = db
      .select({ artistId: musicTrackArtists.artistId })
      .from(musicTrackArtists)
      .where(eq(musicTrackArtists.artistId, artist.id))
      .all().length;
    if (trackRefs > 0) continue;
    db.delete(musicArtists).where(eq(musicArtists.id, artist.id)).run();
  }

  // Update last scanned timestamp (mirrors the other scanners).
  db.update(mediaLibraries)
    .set({ lastScannedAt: new Date().toISOString() })
    .where(eq(mediaLibraries.id, library.id))
    .run();

  return { scannedCount, removedCount, skipped: [] };
}

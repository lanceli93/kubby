import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { mediaLibraries, photoItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseFolderPaths } from "@/lib/folder-paths";
import { getPhotoThumbsDir, getFfmpegPath, toRelativeDataPath, resolveDataPath } from "@/lib/paths";
import { probeVideo } from "./probe";
import type { ScanProgress, SkippedFolder } from "./index";

// ─── Constants ─────────────────────────────────────────────────

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".avif"];
const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".3gp"];
// Formats browsers can't render inline → also generate a large preview WebP.
const PREVIEW_EXTENSIONS = [".heic", ".heif"];

// Junk directories to skip (NAS thumbnails, recycle bins, cache dirs).
const SKIP_DIRS = new Set(["@eaDir", "#recycle", ".thumbnails"]);

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".3gp": "video/3gpp",
};

// exifr returns Orientation as a human string (its default value reviver).
// Map it back to the numeric EXIF value for the integer column / thumbnail math.
const ORIENTATION_STRING_TO_NUM: Record<string, number> = {
  "Horizontal (normal)": 1,
  "Mirror horizontal": 2,
  "Rotate 180": 3,
  "Mirror vertical": 4,
  "Mirror horizontal and rotate 270 CW": 5,
  "Rotate 90 CW": 6,
  "Mirror horizontal and rotate 90 CW": 7,
  "Rotate 270 CW": 8,
};

// Long-tail EXIF keys that are large/binary and not worth persisting in exifJson.
const EXIF_JSON_SKIP_KEYS = new Set([
  "thumbnail",
  "makerNote",
  "MakerNote",
  "userComment",
  "UserComment",
  "ApplicationNotes",
]);

type PhotoLibrary = typeof mediaLibraries.$inferSelect;
type PhotoRow = typeof photoItems.$inferSelect;

// ─── Filesystem walk ───────────────────────────────────────────

interface WalkedFile {
  fullPath: string;
  /** Folder relative to the library root, POSIX slashes; "" for the root itself. */
  folderPath: string;
  isVideo: boolean;
}

/**
 * Recursively collect image/video files under a library root, skipping
 * dotfiles, dot-directories and common junk dirs (@eaDir, #recycle, …).
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
      const isImage = IMAGE_EXTENSIONS.includes(ext);
      const isVideo = VIDEO_EXTENSIONS.includes(ext);
      if (!isImage && !isVideo) continue;
      const fullPath = path.join(dir, name);
      const rel = path.relative(root, path.dirname(fullPath)).replace(/\\/g, "/");
      results.push({ fullPath, folderPath: rel === "." ? "" : rel, isVideo });
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

// ─── ffmpeg helpers ────────────────────────────────────────────

function execFileAsync(cmd: string, args: string[], timeout = 60000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/** Decode an image to a WebP thumbnail/preview with ffmpeg (HEIC/HEIF fallback). */
async function ffmpegImageToWebp(src: string, dst: string, maxLongEdge: number): Promise<void> {
  await execFileAsync(getFfmpegPath(), [
    "-y",
    "-i", src,
    "-vf", `scale='min(${maxLongEdge},iw)':-2`,
    "-c:v", "libwebp",
    "-quality", "80",
    dst,
  ]);
}

/** Extract a middle frame from a video as a WebP thumbnail. */
async function ffmpegVideoThumb(src: string, dst: string, seekSeconds: number): Promise<void> {
  await execFileAsync(getFfmpegPath(), [
    "-y",
    "-ss", String(Math.max(0, seekSeconds)),
    "-i", src,
    "-frames:v", "1",
    "-vf", "scale='min(400,iw)':-2",
    "-c:v", "libwebp",
    "-quality", "80",
    dst,
  ]);
}

// ─── EXIF helpers ──────────────────────────────────────────────

function orientationToNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = ORIENTATION_STRING_TO_NUM[value];
    if (n !== undefined) return n;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** exifr returns JS Dates; convert to epoch ms, guarding against invalid dates. */
function dateToEpochMs(value: unknown): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/**
 * Serialize the long-tail EXIF (everything not promoted to a real column) into a
 * compact JSON string. Drops binary/oversized fields and anything unstringifiable.
 */
function buildExifJson(exif: Record<string, unknown> | null | undefined): string | null {
  if (!exif) return null;
  const out: Record<string, unknown> = {};
  const promoted = new Set([
    "DateTimeOriginal", "CreateDate", "Make", "Model", "Orientation",
    "latitude", "longitude", "GPSLatitude", "GPSLongitude",
  ]);
  for (const [key, val] of Object.entries(exif)) {
    if (promoted.has(key)) continue;
    if (EXIF_JSON_SKIP_KEYS.has(key)) continue;
    if (val == null) continue;
    // Skip binary blobs and very long strings.
    if (val instanceof Uint8Array || Buffer.isBuffer(val)) continue;
    if (typeof val === "string" && val.length > 512) continue;
    if (typeof val === "function") continue;
    out[key] = val instanceof Date ? val.toISOString() : val;
  }
  if (Object.keys(out).length === 0) return null;
  try {
    const json = JSON.stringify(out);
    // Cap overall size to avoid pathological rows.
    return json.length > 16000 ? null : json;
  } catch {
    return null;
  }
}

// ─── Thumbnail directory ───────────────────────────────────────

function thumbPathsFor(libraryId: string, id: string): { thumbDir: string; thumb: string; preview: string } {
  const thumbDir = path.join(getPhotoThumbsDir(), libraryId);
  return {
    thumbDir,
    thumb: path.join(thumbDir, `${id}.webp`),
    preview: path.join(thumbDir, `${id}-preview.webp`),
  };
}

function fileExistsWithSize(p: string): boolean {
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

// ─── Per-file processing ───────────────────────────────────────

type UpsertValues = typeof photoItems.$inferInsert;

async function processImage(
  file: WalkedFile,
  id: string,
  libraryId: string,
  stat: fs.Stats,
): Promise<UpsertValues> {
  const ext = path.extname(file.fullPath).toLowerCase();
  const { thumbDir, thumb, preview } = thumbPathsFor(libraryId, id);
  fs.mkdirSync(thumbDir, { recursive: true });

  // Lazy-load sharp (optional peer dep; may fail to decode HEIC → ffmpeg fallback).
  let sharpMod: typeof import("sharp") | null = null;
  try {
    sharpMod = (await import("sharp")).default;
  } catch {
    sharpMod = null;
  }

  // EXIF extraction — non-fatal.
  let exif: Record<string, unknown> | null = null;
  try {
    const exifr = (await import("exifr")).default;
    exif = await exifr.parse(file.fullPath, { gps: true, translateValues: true });
  } catch (e) {
    console.warn(`EXIF parse failed for ${file.fullPath}:`, (e as Error).message);
  }

  const takenAt =
    dateToEpochMs(exif?.DateTimeOriginal) ??
    dateToEpochMs(exif?.CreateDate) ??
    Math.floor(stat.mtimeMs);
  const orientation = orientationToNumber(exif?.Orientation);
  const cameraMake = typeof exif?.Make === "string" ? exif.Make : null;
  const cameraModel = typeof exif?.Model === "string" ? exif.Model : null;
  const gpsLat = typeof exif?.latitude === "number" ? exif.latitude : null;
  const gpsLng = typeof exif?.longitude === "number" ? exif.longitude : null;

  // Dimensions in display orientation (swap for EXIF orientation 5-8).
  let width: number | null = null;
  let height: number | null = null;
  if (sharpMod) {
    try {
      const meta = await sharpMod(file.fullPath).metadata();
      if (meta.width && meta.height) {
        const swap = (meta.orientation && meta.orientation >= 5) || (orientation != null && orientation >= 5);
        width = swap ? meta.height : meta.width;
        height = swap ? meta.width : meta.height;
      }
    } catch {
      // HEIC etc. — dimensions filled from ffprobe below if possible.
    }
  }

  // Thumbnail: sharp first, ffmpeg fallback (HEIC/HEIF).
  let thumbnailPath: string | null = null;
  let thumbGenerated = false;
  if (sharpMod) {
    try {
      await sharpMod(file.fullPath)
        .rotate()
        .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(thumb);
      thumbGenerated = true;
    } catch {
      thumbGenerated = false;
    }
  }
  if (!thumbGenerated) {
    try {
      await ffmpegImageToWebp(file.fullPath, thumb, 400);
      thumbGenerated = true;
    } catch (e) {
      console.warn(`Thumbnail generation failed for ${file.fullPath}:`, (e as Error).message);
    }
  }
  if (thumbGenerated && fileExistsWithSize(thumb)) {
    thumbnailPath = toRelativeDataPath(thumb);
  }

  // Large preview for browser-unrenderable formats (HEIC/HEIF).
  let previewPath: string | null = null;
  if (PREVIEW_EXTENSIONS.includes(ext)) {
    let previewGenerated = false;
    if (sharpMod) {
      try {
        await sharpMod(file.fullPath)
          .rotate()
          .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(preview);
        previewGenerated = true;
      } catch {
        previewGenerated = false;
      }
    }
    if (!previewGenerated) {
      try {
        await ffmpegImageToWebp(file.fullPath, preview, 2000);
        previewGenerated = true;
      } catch (e) {
        console.warn(`Preview generation failed for ${file.fullPath}:`, (e as Error).message);
      }
    }
    if (previewGenerated && fileExistsWithSize(preview)) {
      previewPath = toRelativeDataPath(preview);
    }
  }

  // If sharp couldn't read dimensions (HEIC), try ffprobe as a fallback.
  if ((width == null || height == null)) {
    const probe = await probeVideo(file.fullPath);
    if (probe?.videoWidth && probe?.videoHeight) {
      width = probe.videoWidth;
      height = probe.videoHeight;
    }
  }

  return {
    id,
    libraryId,
    filePath: file.fullPath,
    fileName: path.basename(file.fullPath),
    isVideo: false,
    takenAt,
    width,
    height,
    durationSeconds: null,
    videoCodec: null,
    audioCodec: null,
    container: null,
    fileSize: stat.size,
    mimeType: MIME_BY_EXT[ext] ?? null,
    cameraMake,
    cameraModel,
    gpsLat,
    gpsLng,
    orientation,
    thumbnailPath,
    previewPath,
    exifJson: buildExifJson(exif),
    folderPath: file.folderPath,
    dateModified: Math.floor(stat.mtimeMs),
  };
}

async function processVideo(
  file: WalkedFile,
  id: string,
  libraryId: string,
  stat: fs.Stats,
): Promise<UpsertValues> {
  const ext = path.extname(file.fullPath).toLowerCase();
  const { thumbDir, thumb } = thumbPathsFor(libraryId, id);
  fs.mkdirSync(thumbDir, { recursive: true });

  const probe = await probeVideo(file.fullPath);
  const durationSeconds = probe?.durationSeconds ?? null;
  const width = probe?.videoWidth ?? null;
  const height = probe?.videoHeight ?? null;
  const videoCodec = probe?.videoCodec ?? null;
  const audioCodec = probe?.audioCodec ?? null;
  // Container from probe (file extension, e.g. "mov"/"mp4") — matches the movie
  // scanner's convention; falls back to this file's extension.
  const container = probe?.container || ext.replace(".", "") || null;

  // takenAt: container creation_time (probe.ts doesn't expose it → light extra
  // ffprobe call), falling back to file mtime.
  const creationTime = await readVideoCreationTime(file.fullPath);
  const takenAt = creationTime ?? Math.floor(stat.mtimeMs);

  // Thumbnail: middle frame (or start if duration unknown).
  const seek = durationSeconds && durationSeconds > 0 ? durationSeconds / 2 : 0;
  let thumbnailPath: string | null = null;
  try {
    await ffmpegVideoThumb(file.fullPath, thumb, seek);
    if (fileExistsWithSize(thumb)) thumbnailPath = toRelativeDataPath(thumb);
  } catch (e) {
    console.warn(`Video thumbnail failed for ${file.fullPath}:`, (e as Error).message);
  }

  return {
    id,
    libraryId,
    filePath: file.fullPath,
    fileName: path.basename(file.fullPath),
    isVideo: true,
    takenAt,
    width,
    height,
    durationSeconds,
    videoCodec,
    audioCodec,
    container,
    fileSize: stat.size,
    mimeType: MIME_BY_EXT[ext] ?? null,
    cameraMake: null,
    cameraModel: null,
    gpsLat: null,
    gpsLng: null,
    orientation: null,
    thumbnailPath,
    previewPath: null,
    exifJson: null,
    folderPath: file.folderPath,
    dateModified: Math.floor(stat.mtimeMs),
  };
}

/** Read a video's container-level creation_time tag via ffprobe → epoch ms. */
function readVideoCreationTime(filePath: string): Promise<number | null> {
  const ffprobePath = process.env.FFPROBE_PATH || "ffprobe";
  return new Promise((resolve) => {
    try {
      execFile(
        ffprobePath,
        [
          "-v", "quiet",
          "-print_format", "json",
          "-show_entries", "format_tags=creation_time",
          filePath,
        ],
        { timeout: 30000, maxBuffer: 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            resolve(null);
            return;
          }
          try {
            const data = JSON.parse(stdout);
            const ct = data?.format?.tags?.creation_time;
            resolve(dateToEpochMs(ct));
          } catch {
            resolve(null);
          }
        }
      );
    } catch {
      resolve(null);
    }
  });
}

// ─── Cleanup helper ────────────────────────────────────────────

function removePhotoFiles(row: Pick<PhotoRow, "thumbnailPath" | "previewPath">) {
  for (const rel of [row.thumbnailPath, row.previewPath]) {
    if (!rel) continue;
    // Stored relative to data dir; resolve for deletion.
    try {
      fs.rmSync(resolveDataPath(rel), { force: true });
    } catch {
      // non-critical
    }
  }
}

// ─── Entry point ───────────────────────────────────────────────

export async function scanPhotoLibrary(
  library: PhotoLibrary,
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

  // 1-2. Walk all roots and collect candidate files.
  const files: WalkedFile[] = [];
  for (const root of validPaths) {
    files.push(...walkLibrary(root));
  }
  console.log(`Photo scan: found ${files.length} media files in library ${library.id}`);

  // Load existing rows keyed by absolute filePath.
  const existingRows = db
    .select()
    .from(photoItems)
    .where(eq(photoItems.libraryId, library.id))
    .all();
  const rowByPath = new Map<string, PhotoRow>();
  for (const row of existingRows) rowByPath.set(row.filePath, row);

  const seenPaths = new Set<string>();
  let scannedCount = 0;

  // Partition into unchanged (skip) vs new/changed (process).
  const toProcess: { file: WalkedFile; stat: fs.Stats; existing: PhotoRow | undefined }[] = [];
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

  // 3-5. Process new/changed files with a small concurrency pool.
  let processedIdx = 0;
  const total = toProcess.length;
  let lastPctBucket = -1;

  await runPool(toProcess, 4, async ({ file, stat, existing }) => {
    const id = existing?.id || uuidv4();
    try {
      const values = file.isVideo
        ? await processVideo(file, id, library.id, stat)
        : await processImage(file, id, library.id, stat);

      if (existing) {
        db.update(photoItems).set(values).where(eq(photoItems.id, id)).run();
      } else {
        db.insert(photoItems).values(values).run();
      }
      scannedCount++;
    } catch (e) {
      console.warn(`Failed to process photo item ${file.fullPath}:`, (e as Error).message);
      // Skip this file — not counted as scanned, not a skipped folder.
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

  // If the library was deleted mid-scan, skip the destructive cleanup + the
  // lastScannedAt write so we don't touch state for a now-gone library.
  const stillExists = db
    .select({ id: mediaLibraries.id })
    .from(mediaLibraries)
    .where(eq(mediaLibraries.id, library.id))
    .get();
  if (!stillExists) {
    return { scannedCount, removedCount: 0, skipped: [] };
  }

  // 6. Cleanup: rows whose file no longer exists on disk.
  let removedCount = 0;
  for (const row of existingRows) {
    if (!seenPaths.has(row.filePath)) {
      removePhotoFiles(row);
      db.delete(photoItems).where(eq(photoItems.id, row.id)).run();
      removedCount++;
    }
  }
  if (removedCount > 0) {
    console.log(`Removed ${removedCount} photo items no longer found on disk`);
  }

  // 8. Update last scanned timestamp (mirrors movie scanner).
  db.update(mediaLibraries)
    .set({ lastScannedAt: new Date().toISOString() })
    .where(eq(mediaLibraries.id, library.id))
    .run();

  return { scannedCount, removedCount, skipped: [] };
}

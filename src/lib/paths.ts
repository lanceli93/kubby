import path from "path";
import os from "os";

/**
 * Centralized path management for Kubby.
 *
 * In development: defaults to `process.cwd()/data/`
 * In production (packaged): set KUBBY_DATA_DIR to the OS-standard location
 *   - Windows:  %LOCALAPPDATA%\Kubby
 *   - macOS:    ~/Library/Application Support/Kubby
 *   - Linux:    ~/.local/share/kubby
 */

export function getDataDir(): string {
  return process.env.KUBBY_DATA_DIR || path.join(process.cwd(), "data");
}

export function getDbPath(): string {
  return path.join(getDataDir(), "kubby.db");
}

/**
 * Authoring source for the demo media bundle: the raw `demo-assets/` tree that
 * lives committed in the repo (so a dev box seeds with zero network). This is
 * NOT shipped in packaged builds anymore — packaged installs download the pack
 * from a GitHub release instead (see getDemoAssetsCacheDir + demo/fetch-assets).
 * Override with KUBBY_DEMO_ASSETS_DIR (e.g. tests / non-standard layouts).
 */
export function getDemoAssetsDir(): string {
  return process.env.KUBBY_DEMO_ASSETS_DIR || path.join(process.cwd(), "demo-assets");
}

/**
 * Writable location under the data dir where a downloaded demo asset pack is
 * extracted (packaged installs have no committed `demo-assets/` tree). Kept
 * under the data dir so a factory reset can leave it in place for re-seeding,
 * or a user can delete it to force a fresh download.
 */
export function getDemoAssetsCacheDir(): string {
  return path.join(getDataDir(), "demo-assets");
}

/**
 * Writable location where demo assets are materialized at seed time (the bundle
 * dir may be read-only, and the placeholder video is copied into each item
 * folder here). Lives under the data dir so factory-reset can wipe it wholesale.
 */
export function getDemoDir(): string {
  return path.join(getDataDir(), "demo");
}

export function getMetadataDir(): string {
  return path.join(getDataDir(), "metadata");
}

export function getPeopleMetadataDir(): string {
  return path.join(getMetadataDir(), "people");
}

export function getTvPeopleMetadataDir(): string {
  return path.join(getMetadataDir(), "tv-people");
}

export function getBookmarksDir(): string {
  return path.join(getMetadataDir(), "bookmarks");
}

export function getBookmarkIconsDir(): string {
  return path.join(getMetadataDir(), "bookmark-icons");
}

export function getPhotoThumbsDir(): string {
  return path.join(getMetadataDir(), "photo-thumbs");
}

export function getMusicArtDir(): string {
  return path.join(getMetadataDir(), "music-art");
}

export function getFfmpegPath(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

export function getTranscodeCacheDir(): string {
  return path.join(os.tmpdir(), "kubby-transcode");
}

export function getImageCacheDir(): string {
  return path.join(getDataDir(), "cache", "images");
}

/**
 * Convert an absolute path under KUBBY_DATA_DIR to a relative path for DB storage.
 * e.g. "D:\KubbyData\metadata\people\A\Actor\photo.jpg" → "metadata/people/A/Actor/photo.jpg"
 * Returns the original path unchanged if it's not under the data dir.
 */
export function toRelativeDataPath(absolutePath: string): string {
  const dataDir = getDataDir();
  const normalized = path.normalize(absolutePath);
  const normalizedDataDir = path.normalize(dataDir);
  if (normalized.startsWith(normalizedDataDir + path.sep) || normalized.startsWith(normalizedDataDir + "/")) {
    return normalized.slice(normalizedDataDir.length + 1).replace(/\\/g, "/");
  }
  return absolutePath;
}

/**
 * Resolve a DB-stored path (relative or legacy absolute) to an absolute filesystem path.
 * Relative paths are resolved against the current KUBBY_DATA_DIR.
 */
export function resolveDataPath(storedPath: string): string {
  if (path.isAbsolute(storedPath)) return storedPath;
  return path.join(getDataDir(), storedPath);
}

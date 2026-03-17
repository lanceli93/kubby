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

export function getMetadataDir(): string {
  return path.join(getDataDir(), "metadata");
}

export function getPeopleMetadataDir(): string {
  return path.join(getMetadataDir(), "people");
}

export function getBookmarksDir(): string {
  return path.join(getMetadataDir(), "bookmarks");
}

export function getBookmarkIconsDir(): string {
  return path.join(getMetadataDir(), "bookmark-icons");
}

export function getFfmpegPath(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

export function getTranscodeCacheDir(): string {
  return path.join(os.tmpdir(), "kubby-transcode");
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

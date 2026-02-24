import path from "path";

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

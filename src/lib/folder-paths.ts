/**
 * Backward-compatible helpers for multi-folder library paths.
 *
 * Existing libraries store a plain string in `folderPath`.
 * New/updated libraries store a JSON array string like `["/a","/b"]`.
 * These helpers transparently handle both formats.
 */

export function parseFolderPaths(raw: string): string[] {
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((p) => typeof p === "string" && p.length > 0);
    } catch {
      // fall through — treat as plain path
    }
  }
  return raw ? [raw] : [];
}

export function serializeFolderPaths(paths: string[]): string {
  return JSON.stringify(paths);
}

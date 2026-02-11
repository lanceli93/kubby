/**
 * Resolve an image path to a usable src URL.
 * - Remote URLs (http/https) are returned as-is.
 * - Local filesystem paths are proxied through /api/images/.
 */
export function resolveImageSrc(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `/api/images/${encodeURIComponent(path)}`;
}

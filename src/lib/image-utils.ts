/**
 * Resolve an image path to a usable src URL.
 * - Remote URLs (http/https) are returned as-is.
 * - Local filesystem paths are proxied through /api/images/.
 *
 * Paths may contain a `|version` suffix (e.g. `/path/photo.jpg|1708500000`)
 * appended by API routes for cache-busting.  The version is extracted and
 * forwarded as a `?v=` query parameter so the browser treats a replaced file
 * as a new URL.
 */
export function resolveImageSrc(pathWithVersion: string): string {
  if (pathWithVersion.startsWith("http://") || pathWithVersion.startsWith("https://")) {
    return pathWithVersion;
  }
  const sepIdx = pathWithVersion.lastIndexOf("|");
  const filePath = sepIdx > 0 ? pathWithVersion.slice(0, sepIdx) : pathWithVersion;
  const version = sepIdx > 0 ? pathWithVersion.slice(sepIdx + 1) : null;
  const url = `/api/images/${encodeURIComponent(filePath)}`;
  return version ? `${url}?v=${version}` : url;
}

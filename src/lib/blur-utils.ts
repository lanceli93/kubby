import fs from "fs";
import path from "path";

/**
 * Generate a tiny base64 JPEG data URL for use as a blur placeholder.
 * Uses sharp if available, otherwise returns null gracefully.
 */
export async function generateBlurDataURL(imagePath: string): Promise<string | null> {
  try {
    if (!fs.existsSync(imagePath)) return null;

    // Dynamic import sharp — it's an optional peer dependency
    let sharp: typeof import("sharp");
    try {
      sharp = (await import("sharp")).default;
    } catch {
      return null;
    }

    const buffer = await sharp(imagePath)
      .resize(10, 15, { fit: "cover" })
      .jpeg({ quality: 40 })
      .toBuffer();

    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Get file mtime as a number (milliseconds since epoch).
 * Returns null if the file doesn't exist.
 */
export function getFileMtime(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

// Aspect-ratio cache keyed by `absolutePath|mtimeMs` — arbitrary-ratio images
// (person fanart / gallery) are read once per file version, so a hero-wall
// refresh doesn't re-decode headers. Bounded so a huge library can't grow it
// without limit (simple FIFO eviction — these are just numbers).
const aspectCache = new Map<string, number>();
const ASPECT_CACHE_MAX = 5000;

/**
 * Read an image's width/height ratio (e.g. 0.667 for 2:3, 1.78 for 16:9) from
 * its header via sharp — header-only, so it does not decode pixels. Returns
 * null if the file is missing, sharp is unavailable, or dimensions are absent
 * (EXIF-rotated images are respected via `autoOrient`). Cached per file+mtime.
 */
export async function getImageAspect(imagePath: string): Promise<number | null> {
  const mtime = getFileMtime(imagePath);
  if (mtime == null) return null;
  const key = `${imagePath}|${mtime}`;
  const cached = aspectCache.get(key);
  if (cached !== undefined) return cached;

  try {
    let sharp: typeof import("sharp");
    try {
      sharp = (await import("sharp")).default;
    } catch {
      return null;
    }
    const meta = await sharp(imagePath).metadata();
    // autoOrient: honor EXIF orientation so a rotated phone photo reports its
    // displayed ratio, not the stored (pre-rotation) one.
    const rotated = meta.orientation && meta.orientation >= 5; // 90°/270°
    const w = rotated ? meta.height : meta.width;
    const h = rotated ? meta.width : meta.height;
    if (!w || !h) return null;
    const ratio = w / h;

    if (aspectCache.size >= ASPECT_CACHE_MAX) {
      const oldest = aspectCache.keys().next().value;
      if (oldest !== undefined) aspectCache.delete(oldest);
    }
    aspectCache.set(key, ratio);
    return ratio;
  } catch {
    return null;
  }
}

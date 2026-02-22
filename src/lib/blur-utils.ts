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

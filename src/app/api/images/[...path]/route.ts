import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getImageCacheDir } from "@/lib/paths";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
};

let sharpModule: typeof import("sharp") | null = null;
let sharpLoadFailed = false;
async function getSharp() {
  if (sharpModule) return sharpModule;
  // Once the import has failed once, don't retry or re-log on every request —
  // a broken native binary won't fix itself within the process lifetime.
  if (sharpLoadFailed) return null;
  try {
    sharpModule = (await import("sharp")).default;
    return sharpModule;
  } catch (error: unknown) {
    sharpLoadFailed = true;
    console.error(
      "Failed to load sharp — serving original images without resize:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// Track the first cache-write failure so we log it once instead of on every miss.
let cacheWriteFailed = false;

// GET /api/images/[...path] - Serve local image files with optional resize
// Query params: ?w=WIDTH (resize width) &q=QUALITY (1-100, default 80)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const imagePath = decodeURIComponent(pathSegments.join("/"));

  // Security: prevent path traversal
  // Check that no segment is literally ".." (allows filenames containing ".." like "A...B")
  const normalizedPath = path.normalize(imagePath);
  const segments = normalizedPath.split(path.sep);
  if (segments.some((s) => s === "..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const { searchParams } = request.nextUrl;
  const requestedWidth = parseInt(searchParams.get("w") || "0", 10);
  const quality = parseInt(searchParams.get("q") || "80", 10);
  const clampedQuality = Math.min(Math.max(quality, 1), 100);

  try {
    // If width requested, try to serve a previously-resized WebP from disk cache.
    // The cache key must uniquely identify the source content + resize params, so
    // that a replaced file (new mtime / new `v`) never returns a stale entry.
    // `v` comes from resolveImageSrc (a file mtime); when the client omits it we
    // fall back to reading the real mtime so correctness never depends on `v`.
    if (requestedWidth > 0) {
      const version =
        searchParams.get("v") || String((await fs.promises.stat(imagePath)).mtimeMs);
      // Hash the version together with the path: `v` is client-supplied, so it
      // must never appear verbatim in the filename (path traversal).
      const hash = crypto
        .createHash("sha1")
        .update(`${path.resolve(imagePath)}|${version}`)
        .digest("hex");
      const cacheDir = getImageCacheDir();
      const cacheFileName = `${hash}-w${requestedWidth}-q${clampedQuality}.webp`;
      const cacheFile = path.join(cacheDir, cacheFileName);

      // Cache hit: return directly without ever loading sharp or the original.
      try {
        const cached = await fs.promises.readFile(cacheFile);
        return new Response(new Uint8Array(cached), {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      } catch {
        // Cache miss (ENOENT or unreadable) — fall through to resize below.
      }

      const sharp = await getSharp();
      if (sharp) {
        const data = await fs.promises.readFile(imagePath);
        const optimized = await sharp(data)
          .resize(requestedWidth, undefined, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: clampedQuality })
          .toBuffer();

        // Persist to disk cache. No eviction: resized webps are tiny (~20KB each),
        // so the cache can grow unbounded without practical concern.
        // Write to a temp file then rename so a concurrent request never reads a
        // half-written file. A write failure must never fail the response.
        try {
          await fs.promises.mkdir(cacheDir, { recursive: true });
          const tmpFile = `${cacheFile}.${process.pid}-${crypto.randomBytes(6).toString("hex")}.tmp`;
          await fs.promises.writeFile(tmpFile, optimized);
          try {
            await fs.promises.rename(tmpFile, cacheFile);
          } catch (renameError: unknown) {
            // On Windows, renaming over an existing file throws EEXIST/EPERM —
            // that just means another request already wrote this entry. Drop our
            // temp copy and treat it as success; the response is unaffected.
            await fs.promises.unlink(tmpFile).catch(() => {});
            const code = (renameError as NodeJS.ErrnoException).code;
            if (code !== "EEXIST" && code !== "EPERM" && code !== "ENOENT") {
              throw renameError;
            }
          }
        } catch (writeError: unknown) {
          if (!cacheWriteFailed) {
            cacheWriteFailed = true;
            console.error("Failed to write image cache (serving uncached):", writeError);
          }
        }

        return new Response(new Uint8Array(optimized), {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    // Fallback: serve original file (no width requested, or sharp unavailable).
    const data = await fs.promises.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Image serve error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

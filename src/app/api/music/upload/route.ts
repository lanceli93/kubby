import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { db } from "@/lib/db";
import { mediaLibraries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { parseFolderPaths } from "@/lib/folder-paths";

// Allowed audio extensions — mirrors the scanner's AUDIO_EXTENSIONS.
const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus",
  ".wav", ".wma", ".aiff", ".aif", ".alac",
]);

// Subfolder within the library where browser uploads land, keeping them tidy
// and separate from files the user manages directly.
const UPLOAD_SUBDIR = "Uploads";

/** Strip path separators / traversal from a client-supplied filename. */
function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[\\/]/g, "_").replace(/^\.+/, "");
  return base || "track";
}

/** Pick a non-colliding destination path by appending " (n)" before the ext. */
async function uniqueDest(dir: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  for (let n = 1; ; n++) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${stem} (${n})${ext}`);
    } catch {
      return candidate; // does not exist
    }
  }
}

// POST /api/music/upload  (multipart/form-data)
// Fields: libraryId (string), files (one or more audio files).
// Streams each file into {libraryFolder}/Uploads/, then returns { libraryId,
// saved, skipped } — the client triggers a library scan to ingest them.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const libraryId = form.get("libraryId");
    if (typeof libraryId !== "string" || !libraryId) {
      return NextResponse.json({ error: "libraryId is required" }, { status: 400 });
    }

    const library = db
      .select({ type: mediaLibraries.type, folderPath: mediaLibraries.folderPath })
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, libraryId))
      .get();
    if (!library) {
      return NextResponse.json({ error: "Library not found" }, { status: 404 });
    }
    // Cross-domain safety: only music libraries accept audio uploads.
    if (library.type !== "music") {
      return NextResponse.json({ error: "Not a music library" }, { status: 400 });
    }

    const roots = parseFolderPaths(library.folderPath);
    if (roots.length === 0) {
      return NextResponse.json({ error: "Library has no folder configured" }, { status: 400 });
    }
    const destDir = path.join(roots[0], UPLOAD_SUBDIR);
    await fs.mkdir(destDir, { recursive: true });

    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const saved: string[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const file of files) {
      const cleanName = sanitizeFileName(file.name);
      const ext = path.extname(cleanName).toLowerCase();
      if (!AUDIO_EXTENSIONS.has(ext)) {
        skipped.push({ name: file.name, reason: "unsupported" });
        continue;
      }
      const dest = await uniqueDest(destDir, cleanName);
      try {
        // Stream the upload to disk so large FLACs don't buffer fully in memory.
        const nodeStream = Readable.fromWeb(file.stream() as import("stream/web").ReadableStream);
        await pipeline(nodeStream, createWriteStream(dest));
        saved.push(path.basename(dest));
      } catch (e) {
        console.error("Music upload: failed to write", dest, e);
        skipped.push({ name: file.name, reason: "write-failed" });
        await fs.rm(dest, { force: true }).catch(() => {});
      }
    }

    return NextResponse.json({ libraryId, saved, skipped });
  } catch (error) {
    console.error("Music upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

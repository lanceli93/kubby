import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { mediaLibraries, photoAlbums, photoItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseFolderPaths } from "@/lib/folder-paths";
import { getPhotoThumbsDir, resolveDataPath } from "@/lib/paths";

// Permanent removal of a photo/video: the source file on disk, its generated
// thumbnail/preview under metadata/photo-thumbs/, and the DB row. The source
// file must go too — removing only the row would just get it re-added by the
// next scan. Album memberships cascade via the photo_album_items FK; explicit
// album covers pointing at the item are cleared (cover_item_id has no FK).

export type DeletePhotoResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

// Windows paths are case-insensitive and the DB may store a different case, so
// compare lowercased there; keep exact bytes on POSIX.
const norm = (p: string) => (process.platform === "win32" ? p.toLowerCase() : p);

function isInside(target: string, root: string): boolean {
  const t = norm(path.resolve(target));
  const r = norm(path.resolve(root));
  return t.startsWith(r + path.sep);
}

export function deletePhotoItem(id: string): DeletePhotoResult {
  const row = db
    .select({
      id: photoItems.id,
      filePath: photoItems.filePath,
      thumbnailPath: photoItems.thumbnailPath,
      previewPath: photoItems.previewPath,
      libraryId: photoItems.libraryId,
      libraryType: mediaLibraries.type,
      libraryFolderPath: mediaLibraries.folderPath,
    })
    .from(photoItems)
    .innerJoin(mediaLibraries, eq(photoItems.libraryId, mediaLibraries.id))
    .where(eq(photoItems.id, id))
    .get();
  if (!row) return { ok: false, status: 404, error: "Not found" };

  // Cross-domain guard: only ever delete files that belong to a photo library.
  if (row.libraryType !== "photo") {
    return { ok: false, status: 400, error: "Item does not belong to a photo library" };
  }

  // Path-traversal guard: the file must sit inside one of the library's
  // configured folders (a stale row from a since-removed folder is refused).
  const roots = parseFolderPaths(row.libraryFolderPath);
  if (!roots.some((root) => isInside(row.filePath, root))) {
    return { ok: false, status: 403, error: "File is outside the library folders" };
  }

  // Source file first — if it can't be removed (read-only share, locked file),
  // keep the row so the UI and disk stay in agreement.
  try {
    fs.unlinkSync(path.resolve(row.filePath));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      return {
        ok: false,
        status: 500,
        error: `Could not delete file${code ? ` (${code})` : ""}`,
      };
    }
    // Already gone from disk — still clean up the row.
  }

  // Generated artifacts: the stored paths plus the deterministic per-id names
  // (covers rows whose path column was never written). Confined to the thumbs dir.
  const thumbsDir = getPhotoThumbsDir();
  const libThumbDir = path.join(thumbsDir, row.libraryId);
  const artifacts = new Set<string>([
    path.join(libThumbDir, `${row.id}.webp`),
    path.join(libThumbDir, `${row.id}-preview.webp`),
  ]);
  for (const rel of [row.thumbnailPath, row.previewPath]) {
    if (rel) artifacts.add(resolveDataPath(rel));
  }
  for (const file of artifacts) {
    if (!isInside(file, thumbsDir)) continue;
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // non-critical — an orphaned thumbnail is harmless
    }
  }

  db.update(photoAlbums)
    .set({ coverItemId: null })
    .where(eq(photoAlbums.coverItemId, row.id))
    .run();
  db.delete(photoItems).where(eq(photoItems.id, row.id)).run();

  return { ok: true };
}

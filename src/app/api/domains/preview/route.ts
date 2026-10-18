import { NextResponse } from "next/server";
import path from "path";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { movies, tvShows, photoItems, musicAlbums, mediaLibraries } from "@/lib/db/schema";
import { resolveImageSrc } from "@/lib/image-utils";

/** Build a cache-bust stamped path from a pre-stored mtime value (mirrors the
 *  helper in /api/movies — no filesystem I/O). */
function stampPath(p: string | null, mtime?: number | null): string | null {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
}

const PREVIEW_LIMIT = 3;
const PREVIEW_WIDTH = 160;

// GET /api/domains/preview — up to 3 small preview image URLs per media
// domain, for the domain-switcher cards (nav-sidebar MEDIA group / header
// brand dropdown; see DomainCard + useDomainItems). Each domain queries ONLY
// its own table, inner-joined against media_libraries on an allowlisted
// `type` so a domain can never leak another domain's art (see skill →
// Cross-domain operations are a cardinal sin). A key is omitted entirely when
// that domain has no library yet, or no item with an image — DomainCard
// renders icon-only in that case.
export async function GET() {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;

  // posterPath is stored RELATIVE to the item's own folderPath (see
  // /api/movies, /api/tv) — must path.join() the two before resolving to a
  // servable URL, or /api/images 403s on the bare filename.
  const cinemaRows = db
    .select({
      posterPath: movies.posterPath,
      posterMtime: movies.posterMtime,
      folderPath: movies.folderPath,
    })
    .from(movies)
    .innerJoin(mediaLibraries, eq(movies.mediaLibraryId, mediaLibraries.id))
    .where(and(eq(mediaLibraries.type, "movie"), isNotNull(movies.posterPath)))
    .orderBy(desc(movies.dateAdded))
    .limit(PREVIEW_LIMIT)
    .all();

  const tvRows = db
    .select({
      posterPath: tvShows.posterPath,
      posterMtime: tvShows.posterMtime,
      folderPath: tvShows.folderPath,
    })
    .from(tvShows)
    .innerJoin(mediaLibraries, eq(tvShows.mediaLibraryId, mediaLibraries.id))
    .where(and(eq(mediaLibraries.type, "tvshow"), isNotNull(tvShows.posterPath)))
    .orderBy(desc(tvShows.dateAdded))
    .limit(PREVIEW_LIMIT)
    .all();

  const photoRows = db
    .select({ id: photoItems.id })
    .from(photoItems)
    .innerJoin(mediaLibraries, eq(photoItems.libraryId, mediaLibraries.id))
    .where(
      and(
        eq(mediaLibraries.type, "photo"),
        eq(photoItems.isVideo, false),
        isNotNull(photoItems.thumbnailPath)
      )
    )
    .orderBy(desc(photoItems.dateAdded))
    .limit(PREVIEW_LIMIT)
    .all();

  const musicRows = db
    .select({ coverPath: musicAlbums.coverPath })
    .from(musicAlbums)
    .innerJoin(mediaLibraries, eq(musicAlbums.libraryId, mediaLibraries.id))
    .where(and(eq(mediaLibraries.type, "music"), isNotNull(musicAlbums.coverPath)))
    .orderBy(desc(musicAlbums.dateAdded))
    .limit(PREVIEW_LIMIT)
    .all();

  const body: { cinema?: string[]; tv?: string[]; photos?: string[]; music?: string[] } = {};

  if (cinemaRows.length > 0) {
    body.cinema = cinemaRows.map((r) =>
      resolveImageSrc(
        stampPath(path.join(r.folderPath, r.posterPath as string), r.posterMtime) as string,
        PREVIEW_WIDTH
      )
    );
  }
  if (tvRows.length > 0) {
    body.tv = tvRows.map((r) =>
      resolveImageSrc(
        stampPath(path.join(r.folderPath, r.posterPath as string), r.posterMtime) as string,
        PREVIEW_WIDTH
      )
    );
  }
  if (photoRows.length > 0) {
    // Photos go through the dedicated per-item thumb route (fixed-size webp,
    // immutable cache) exactly like photo-grid.tsx — not resolveImageSrc.
    body.photos = photoRows.map((r) => `/api/photos/${r.id}/thumb`);
  }
  if (musicRows.length > 0) {
    body.music = musicRows.map((r) => resolveImageSrc(r.coverPath as string, PREVIEW_WIDTH));
  }

  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}

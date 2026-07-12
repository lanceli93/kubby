import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies, movieDiscs, mediaLibraries, users, photoItems, musicTracks, tvEpisodes, tvShows } from "@/lib/db/schema";
import { count, sum, eq } from "drizzle-orm";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

export async function GET() {
  try {
    const [{ total: totalLibraries }] = db.select({ total: count() }).from(mediaLibraries).all();
    const [{ total: totalUsers }] = db.select({ total: count() }).from(users).all();

    // ── Per-library item counts + disk usage, aggregated across ALL domains ──
    // Each domain keys its rows differently (movies.mediaLibraryId vs
    // photo_items/music_tracks.libraryId) and stores its own fileSize, so we
    // sum each domain separately then merge by libraryId. bytes/items are the
    // per-library accumulators the dashboard renders.
    const usage = new Map<string, { bytes: number; items: number }>();
    const bump = (libraryId: string, bytes: number, items: number) => {
      const cur = usage.get(libraryId) ?? { bytes: 0, items: 0 };
      cur.bytes += bytes;
      cur.items += items;
      usage.set(libraryId, cur);
    };

    // Movies + their extra disc files (movie domain).
    for (const row of db
      .select({ libraryId: movies.mediaLibraryId, totalBytes: sum(movies.fileSize), items: count() })
      .from(movies)
      .groupBy(movies.mediaLibraryId)
      .all()) {
      bump(row.libraryId, Number(row.totalBytes) || 0, row.items);
    }
    for (const row of db
      .select({ libraryId: movies.mediaLibraryId, totalBytes: sum(movieDiscs.fileSize) })
      .from(movieDiscs)
      .innerJoin(movies, eq(movieDiscs.movieId, movies.id))
      .groupBy(movies.mediaLibraryId)
      .all()) {
      bump(row.libraryId, Number(row.totalBytes) || 0, 0); // discs add bytes, not item count
    }

    // Photos + videos (photo domain).
    for (const row of db
      .select({ libraryId: photoItems.libraryId, totalBytes: sum(photoItems.fileSize), items: count() })
      .from(photoItems)
      .groupBy(photoItems.libraryId)
      .all()) {
      bump(row.libraryId, Number(row.totalBytes) || 0, row.items);
    }

    // Tracks (music domain).
    for (const row of db
      .select({ libraryId: musicTracks.libraryId, totalBytes: sum(musicTracks.fileSize), items: count() })
      .from(musicTracks)
      .groupBy(musicTracks.libraryId)
      .all()) {
      bump(row.libraryId, Number(row.totalBytes) || 0, row.items);
    }

    // Episodes (TV domain). tv_episodes keys on showId, so join to tv_shows to
    // reach the library; count episodes as the per-library item total.
    for (const row of db
      .select({ libraryId: tvShows.mediaLibraryId, totalBytes: sum(tvEpisodes.fileSize), items: count() })
      .from(tvEpisodes)
      .innerJoin(tvShows, eq(tvEpisodes.showId, tvShows.id))
      .groupBy(tvShows.mediaLibraryId)
      .all()) {
      bump(row.libraryId, Number(row.totalBytes) || 0, row.items);
    }

    // Every library appears in the breakdown (0-item ones included), with its
    // type so the UI can label the count with the right unit.
    const allLibraries = db
      .select({ id: mediaLibraries.id, name: mediaLibraries.name, type: mediaLibraries.type })
      .from(mediaLibraries)
      .all();

    let totalBytes = 0;
    let totalItems = 0;
    const libraryUsage = allLibraries.map((lib) => {
      const u = usage.get(lib.id) ?? { bytes: 0, items: 0 };
      totalBytes += u.bytes;
      totalItems += u.items;
      return {
        libraryId: lib.id,
        libraryName: lib.name,
        type: lib.type,
        bytes: u.bytes,
        formatted: formatBytes(u.bytes),
        itemCount: u.items,
      };
    });

    // Sort by bytes descending
    libraryUsage.sort((a, b) => b.bytes - a.bytes);

    return NextResponse.json({
      totalItems,
      totalLibraries,
      totalUsers,
      diskUsage: totalBytes > 0 ? formatBytes(totalBytes) : "—",
      diskUsageBytes: totalBytes,
      libraryUsage,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

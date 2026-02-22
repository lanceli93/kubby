import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies, movieDiscs, mediaLibraries, users } from "@/lib/db/schema";
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
    const [{ total: totalMovies }] = db.select({ total: count() }).from(movies).all();
    const [{ total: totalLibraries }] = db.select({ total: count() }).from(mediaLibraries).all();
    const [{ total: totalUsers }] = db.select({ total: count() }).from(users).all();

    // Per-library disk usage: sum movie file sizes grouped by library
    const libraryMovieBytes = db
      .select({
        libraryId: movies.mediaLibraryId,
        totalBytes: sum(movies.fileSize),
        movieCount: count(),
      })
      .from(movies)
      .groupBy(movies.mediaLibraryId)
      .all();

    // Per-library disc file sizes
    const libraryDiscBytes = db
      .select({
        libraryId: movies.mediaLibraryId,
        totalBytes: sum(movieDiscs.fileSize),
      })
      .from(movieDiscs)
      .innerJoin(movies, eq(movieDiscs.movieId, movies.id))
      .groupBy(movies.mediaLibraryId)
      .all();

    // Merge into a map
    const discMap = new Map(libraryDiscBytes.map((r) => [r.libraryId, Number(r.totalBytes) || 0]));

    // Get all libraries for names
    const allLibraries = db.select({ id: mediaLibraries.id, name: mediaLibraries.name }).from(mediaLibraries).all();
    const libraryNameMap = new Map(allLibraries.map((l) => [l.id, l.name]));

    let totalBytes = 0;
    const libraryUsage = libraryMovieBytes.map((row) => {
      const movieSize = Number(row.totalBytes) || 0;
      const discSize = discMap.get(row.libraryId) || 0;
      const bytes = movieSize + discSize;
      totalBytes += bytes;
      return {
        libraryId: row.libraryId,
        libraryName: libraryNameMap.get(row.libraryId) || row.libraryId,
        bytes,
        formatted: formatBytes(bytes),
        movieCount: row.movieCount,
      };
    });

    // Include empty libraries (no movies)
    for (const lib of allLibraries) {
      if (!libraryUsage.find((l) => l.libraryId === lib.id)) {
        libraryUsage.push({
          libraryId: lib.id,
          libraryName: lib.name,
          bytes: 0,
          formatted: "0 B",
          movieCount: 0,
        });
      }
    }

    // Sort by bytes descending
    libraryUsage.sort((a, b) => b.bytes - a.bytes);

    return NextResponse.json({
      totalMovies,
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

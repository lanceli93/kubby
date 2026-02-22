import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies, movieDiscs, mediaLibraries, users } from "@/lib/db/schema";
import { count, sum } from "drizzle-orm";

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

    // Sum file sizes from movies (primary files) and movie_discs (additional discs)
    const [{ total: movieBytes }] = db.select({ total: sum(movies.fileSize) }).from(movies).all();
    const [{ total: discBytes }] = db.select({ total: sum(movieDiscs.fileSize) }).from(movieDiscs).all();
    const totalBytes = (Number(movieBytes) || 0) + (Number(discBytes) || 0);

    return NextResponse.json({
      totalMovies,
      totalLibraries,
      totalUsers,
      diskUsage: totalBytes > 0 ? formatBytes(totalBytes) : "—",
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

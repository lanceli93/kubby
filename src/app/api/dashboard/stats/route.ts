import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { movies, mediaLibraries, users } from "@/lib/db/schema";
import { count } from "drizzle-orm";

export async function GET() {
  try {
    const [{ total: totalMovies }] = db.select({ total: count() }).from(movies).all();
    const [{ total: totalLibraries }] = db.select({ total: count() }).from(mediaLibraries).all();
    const [{ total: totalUsers }] = db.select({ total: count() }).from(users).all();

    return NextResponse.json({
      totalMovies,
      totalLibraries,
      totalUsers,
      diskUsage: "—",
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

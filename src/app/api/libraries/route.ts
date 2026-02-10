import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { mediaLibraries, movies } from "@/lib/db/schema";
import { eq, count, sql } from "drizzle-orm";

// GET /api/libraries
export async function GET() {
  try {
    const libraries = db
      .select({
        id: mediaLibraries.id,
        name: mediaLibraries.name,
        type: mediaLibraries.type,
        folderPath: mediaLibraries.folderPath,
        lastScannedAt: mediaLibraries.lastScannedAt,
        createdAt: mediaLibraries.createdAt,
        movieCount: sql<number>`(SELECT COUNT(*) FROM movies WHERE media_library_id = ${mediaLibraries.id})`,
      })
      .from(mediaLibraries)
      .all();

    return NextResponse.json(libraries);
  } catch (error) {
    console.error("List libraries error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/libraries
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type = "movie", folderPath } = body;

    if (!name || !folderPath) {
      return NextResponse.json(
        { error: "Name and folder path are required" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    db.insert(mediaLibraries)
      .values({ id, name, type, folderPath })
      .run();

    return NextResponse.json({ id, name, type, folderPath }, { status: 201 });
  } catch (error) {
    console.error("Create library error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

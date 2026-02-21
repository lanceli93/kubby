import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { movies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

// POST /api/movies/[id]/images?type=poster|fanart — upload image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type");
  if (type !== "poster" && type !== "fanart") {
    return NextResponse.json({ error: "Invalid type, must be poster or fanart" }, { status: 400 });
  }

  try {
    const movie = db.select().from(movies).where(eq(movies.id, id)).get();
    if (!movie) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = type === "poster" ? "poster.jpg" : "fanart.jpg";
    const destPath = path.join(movie.folderPath, filename);
    fs.writeFileSync(destPath, buffer);

    // Update DB
    if (type === "poster") {
      db.update(movies).set({ posterPath: filename }).where(eq(movies.id, id)).run();
    } else {
      db.update(movies).set({ fanartPath: filename }).where(eq(movies.id, id)).run();
    }

    return NextResponse.json({ path: destPath });
  } catch (error) {
    console.error("Upload movie image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/movies/[id]/images — delete image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const movie = db.select().from(movies).where(eq(movies.id, id)).get();
    if (!movie) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const type = body.type;
    if (type !== "poster" && type !== "fanart") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const relativePath = type === "poster" ? movie.posterPath : movie.fanartPath;
    if (relativePath) {
      const filePath = path.join(movie.folderPath, relativePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Update DB
    if (type === "poster") {
      db.update(movies).set({ posterPath: null }).where(eq(movies.id, id)).run();
    } else {
      db.update(movies).set({ fanartPath: null }).where(eq(movies.id, id)).run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete movie image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

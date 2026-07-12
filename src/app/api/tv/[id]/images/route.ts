import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { tvShows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { generateBlurDataURL } from "@/lib/blur-utils";

// POST /api/tv/[id]/images?type=poster|fanart — upload image
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
    const show = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
    if (!show) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = type === "poster" ? "poster.jpg" : "fanart.jpg";
    const destPath = path.join(show.folderPath, filename);
    fs.writeFileSync(destPath, buffer);

    // Read new mtime + generate blur placeholder
    const mtime = fs.statSync(destPath).mtimeMs;
    const blur = type === "poster" ? await generateBlurDataURL(destPath) : null;

    // Update DB with path, mtime, and blur
    if (type === "poster") {
      db.update(tvShows).set({ posterPath: filename, posterMtime: mtime, posterBlur: blur }).where(eq(tvShows.id, id)).run();
    } else {
      db.update(tvShows).set({ fanartPath: filename, fanartMtime: mtime }).where(eq(tvShows.id, id)).run();
    }

    return NextResponse.json({ path: destPath });
  } catch (error) {
    console.error("Upload tv show image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/tv/[id]/images — delete image
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
    const show = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
    if (!show) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const type = body.type;
    if (type !== "poster" && type !== "fanart") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const relativePath = type === "poster" ? show.posterPath : show.fanartPath;
    if (relativePath) {
      const filePath = path.join(show.folderPath, relativePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Update DB — clear path, mtime, and blur
    if (type === "poster") {
      db.update(tvShows).set({ posterPath: null, posterMtime: null, posterBlur: null }).where(eq(tvShows.id, id)).run();
    } else {
      db.update(tvShows).set({ fanartPath: null, fanartMtime: null }).where(eq(tvShows.id, id)).run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete tv show image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

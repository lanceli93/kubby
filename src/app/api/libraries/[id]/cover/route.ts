import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mediaLibraries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { parseFolderPaths } from "@/lib/folder-paths";

// POST /api/libraries/[id]/cover — upload a custom cover image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const library = db
      .select({ folderPath: mediaLibraries.folderPath })
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, id))
      .get();

    if (!library) {
      return NextResponse.json({ error: "Library not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const folderPaths = parseFolderPaths(library.folderPath);
    const destPath = path.join(folderPaths[0] ?? library.folderPath, "poster.jpg");
    fs.writeFileSync(destPath, buffer);

    return NextResponse.json({ coverImage: destPath });
  } catch (error) {
    console.error("Upload library cover error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/libraries/[id]/cover — remove custom cover image
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const library = db
      .select({ folderPath: mediaLibraries.folderPath })
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, id))
      .get();

    if (!library) {
      return NextResponse.json({ error: "Library not found" }, { status: 404 });
    }

    const folderPaths = parseFolderPaths(library.folderPath);
    const posterPath = path.join(folderPaths[0] ?? library.folderPath, "poster.jpg");
    if (fs.existsSync(posterPath)) {
      fs.unlinkSync(posterPath);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete library cover error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

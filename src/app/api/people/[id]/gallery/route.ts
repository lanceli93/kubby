import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { people } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getPersonDir } from "@/lib/person-utils";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

// GET /api/people/[id]/gallery — list gallery images
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const person = db.select().from(people).where(eq(people.id, id)).get();
    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const personDir = getPersonDir(person);
    const galleryDir = path.join(personDir, "gallery");

    if (!fs.existsSync(galleryDir)) {
      return NextResponse.json({ images: [] });
    }

    const files = fs.readdirSync(galleryDir)
      .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .sort();

    const images = files.map((filename) => ({
      filename,
      path: path.join(galleryDir, filename),
    }));

    return NextResponse.json({ images });
  } catch (error) {
    console.error("Get gallery error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/people/[id]/gallery — upload gallery images
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const person = db.select().from(people).where(eq(people.id, id)).get();
    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const personDir = getPersonDir(person);
    const galleryDir = path.join(personDir, "gallery");
    fs.mkdirSync(galleryDir, { recursive: true });

    // Find the current max number prefix
    const existing = fs.existsSync(galleryDir)
      ? fs.readdirSync(galleryDir).filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
      : [];
    let maxNum = 0;
    for (const f of existing) {
      const num = parseInt(path.basename(f, path.extname(f)), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }

    const formData = await request.formData();
    const files = formData.getAll("file") as File[];
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const created: { filename: string; path: string }[] = [];
    const padLen = Math.max(3, String(maxNum + files.length).length);
    for (const file of files) {
      maxNum++;
      const ext = path.extname(file.name).toLowerCase() || ".jpg";
      const filename = String(maxNum).padStart(padLen, "0") + ext;
      const destPath = path.join(galleryDir, filename);
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(destPath, buffer);
      created.push({ filename, path: destPath });
    }

    return NextResponse.json({ images: created });
  } catch (error) {
    console.error("Upload gallery error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/people/[id]/gallery — remove a gallery image
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
    const person = db.select().from(people).where(eq(people.id, id)).get();
    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const filename = body.filename as string;
    if (!filename || filename.includes("/") || filename.includes("..")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const personDir = getPersonDir(person);
    const filePath = path.join(personDir, "gallery", filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete gallery image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

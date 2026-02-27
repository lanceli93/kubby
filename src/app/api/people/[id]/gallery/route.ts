import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { people } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getPersonDir } from "@/lib/person-utils";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);
const ORDER_FILE = "order.json";

function getGalleryDir(person: { photoPath: string | null; name: string }) {
  return path.join(getPersonDir(person), "gallery");
}

/** Read order.json, reconcile with actual disk files, return final order */
function reconcileOrder(galleryDir: string): string[] {
  const diskFiles = fs.readdirSync(galleryDir)
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort();

  const orderPath = path.join(galleryDir, ORDER_FILE);
  let saved: string[] = [];
  if (fs.existsSync(orderPath)) {
    try {
      saved = JSON.parse(fs.readFileSync(orderPath, "utf-8"));
      if (!Array.isArray(saved)) saved = [];
    } catch {
      saved = [];
    }
  }

  const diskSet = new Set(diskFiles);
  // Keep only files that still exist on disk
  const kept = saved.filter((f) => diskSet.has(f));
  // Append new files not in saved order
  const keptSet = new Set(kept);
  const appended = diskFiles.filter((f) => !keptSet.has(f));
  const finalOrder = [...kept, ...appended];

  // Persist reconciled order if it changed
  if (
    saved.length !== finalOrder.length ||
    saved.some((f, i) => f !== finalOrder[i])
  ) {
    fs.writeFileSync(orderPath, JSON.stringify(finalOrder, null, 2));
  }

  return finalOrder;
}

function writeOrder(galleryDir: string, order: string[]) {
  fs.writeFileSync(path.join(galleryDir, ORDER_FILE), JSON.stringify(order, null, 2));
}

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

    const galleryDir = getGalleryDir(person);

    if (!fs.existsSync(galleryDir)) {
      return NextResponse.json({ images: [] });
    }

    const order = reconcileOrder(galleryDir);
    const images = order.map((filename) => ({
      filename,
      path: path.join(galleryDir, filename),
    }));

    return NextResponse.json({ images });
  } catch (error) {
    console.error("Get gallery error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/people/[id]/gallery — save reordered gallery
export async function PUT(
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
    const order = body.order as string[];
    if (!Array.isArray(order) || order.some((f) => typeof f !== "string")) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }

    const galleryDir = getGalleryDir(person);
    if (!fs.existsSync(galleryDir)) {
      return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
    }

    // Validate: only allow filenames that exist on disk
    const diskFiles = new Set(
      fs.readdirSync(galleryDir).filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    );
    const validOrder = order.filter((f) => diskFiles.has(f));
    // Append any disk files missing from the submitted order
    const validSet = new Set(validOrder);
    for (const f of diskFiles) {
      if (!validSet.has(f)) validOrder.push(f);
    }

    writeOrder(galleryDir, validOrder);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save gallery order error:", error);
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

    const galleryDir = getGalleryDir(person);
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

    // Append new filenames to order.json
    const orderPath = path.join(galleryDir, ORDER_FILE);
    let currentOrder: string[] = [];
    if (fs.existsSync(orderPath)) {
      try {
        currentOrder = JSON.parse(fs.readFileSync(orderPath, "utf-8"));
        if (!Array.isArray(currentOrder)) currentOrder = [];
      } catch {
        currentOrder = [];
      }
    }
    for (const c of created) {
      currentOrder.push(c.filename);
    }
    writeOrder(galleryDir, currentOrder);

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

    const galleryDir = getGalleryDir(person);
    const filePath = path.join(galleryDir, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Remove from order.json
    const orderPath = path.join(galleryDir, ORDER_FILE);
    if (fs.existsSync(orderPath)) {
      try {
        let order: string[] = JSON.parse(fs.readFileSync(orderPath, "utf-8"));
        if (Array.isArray(order)) {
          order = order.filter((f) => f !== filename);
          writeOrder(galleryDir, order);
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete gallery image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

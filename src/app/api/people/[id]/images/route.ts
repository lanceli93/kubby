import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { people } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getPersonDir } from "@/lib/person-utils";

// POST /api/people/[id]/images?type=poster|fanart — upload image
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
    const person = db.select().from(people).where(eq(people.id, id)).get();
    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const personDir = getPersonDir(person);
    fs.mkdirSync(personDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());

    if (type === "poster") {
      const destPath = path.join(personDir, "photo.jpg");
      fs.writeFileSync(destPath, buffer);
      // Update DB with absolute path (matches existing photoPath convention)
      db.update(people).set({ photoPath: destPath }).where(eq(people.id, id)).run();
      return NextResponse.json({ path: destPath });
    } else {
      const destPath = path.join(personDir, "fanart.jpg");
      fs.writeFileSync(destPath, buffer);
      // fanart has no DB column for people — file-only
      return NextResponse.json({ path: destPath });
    }
  } catch (error) {
    console.error("Upload person image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/people/[id]/images — delete image
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
    const type = body.type;
    if (type !== "poster" && type !== "fanart") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const personDir = getPersonDir(person);

    if (type === "poster") {
      if (person.photoPath && fs.existsSync(person.photoPath)) {
        fs.unlinkSync(person.photoPath);
      }
      db.update(people).set({ photoPath: null }).where(eq(people.id, id)).run();
    } else {
      const fanartPath = path.join(personDir, "fanart.jpg");
      if (fs.existsSync(fanartPath)) {
        fs.unlinkSync(fanartPath);
      }
      // No DB column for person fanart
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete person image error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

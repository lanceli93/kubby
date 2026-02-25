import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookmarkIcons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getBookmarkIconsDir } from "@/lib/paths";
import path from "path";
import fs from "fs/promises";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const icons = db
      .select()
      .from(bookmarkIcons)
      .where(eq(bookmarkIcons.userId, session.user.id))
      .all();

    return NextResponse.json(icons);
  } catch (err) {
    console.error("GET /api/settings/bookmark-icons error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const label = formData.get("label") as string | null;
    const file = formData.get("file") as File | null;

    if (!label || !label.trim()) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    // Validate file type
    const validTypes = ["image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: "Only PNG and WebP files are allowed" }, { status: 400 });
    }

    // Validate file size (256KB max)
    if (file.size > 256 * 1024) {
      return NextResponse.json({ error: "File must be 256KB or smaller" }, { status: 400 });
    }

    // Check max icons per user (20)
    const existing = db
      .select()
      .from(bookmarkIcons)
      .where(eq(bookmarkIcons.userId, session.user.id))
      .all();
    if (existing.length >= 20) {
      return NextResponse.json({ error: "Maximum 20 custom icons allowed" }, { status: 400 });
    }

    // Process image with sharp: resize to 64x64 on transparent bg
    const buffer = Buffer.from(await file.arrayBuffer());
    let sharp: typeof import("sharp") | undefined;
    try {
      sharp = (await import("sharp")).default;
    } catch { /* sharp not available */ }

    let outputBuffer: Buffer;
    if (sharp) {
      outputBuffer = await sharp(buffer)
        .resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    } else {
      outputBuffer = buffer;
    }

    // Save file
    const iconId = uuidv4();
    const userDir = path.join(getBookmarkIconsDir(), session.user.id);
    await fs.mkdir(userDir, { recursive: true });
    const filePath = path.join(userDir, `${iconId}.png`);
    await fs.writeFile(filePath, outputBuffer);

    // Relative path for DB (relative to data dir)
    const relativePath = `metadata/bookmark-icons/${session.user.id}/${iconId}.png`;

    // Insert into DB
    db.insert(bookmarkIcons)
      .values({
        id: iconId,
        userId: session.user.id,
        label: label.trim(),
        imagePath: relativePath,
      })
      .run();

    return NextResponse.json({
      id: iconId,
      userId: session.user.id,
      label: label.trim(),
      imagePath: relativePath,
    });
  } catch (err) {
    console.error("POST /api/settings/bookmark-icons error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

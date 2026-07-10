import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { Readable } from "stream";
import { db } from "@/lib/db";
import { photoItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveDataPath } from "@/lib/paths";

// GET /api/photos/[id]/thumb - thumbnail (webp), immutable per id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const item = db
      .select({ thumbnailPath: photoItems.thumbnailPath })
      .from(photoItems)
      .where(eq(photoItems.id, id))
      .get();
    if (!item || !item.thumbnailPath) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const filePath = resolveDataPath(item.thumbnailPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const stream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Photo thumb error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

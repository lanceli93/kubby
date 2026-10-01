import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin, requireUser } from "@/lib/auth-guard";

const NFO_WRITEBACK_KEY = "nfo_writeback_enabled";

// GET /api/settings/nfo-writeback
export async function GET() {
  const guard = await requireUser();
  if (guard instanceof NextResponse) return guard;

  try {
    const row = db
      .select()
      .from(settings)
      .where(eq(settings.key, NFO_WRITEBACK_KEY))
      .get();
    // Default to true if no setting exists
    const enabled = row ? row.value === "true" : true;
    return NextResponse.json({ enabled });
  } catch (error) {
    console.error("Get NFO writeback setting error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/settings/nfo-writeback
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  try {
    const body = await request.json();
    const enabled = !!body.enabled;

    const existing = db
      .select()
      .from(settings)
      .where(eq(settings.key, NFO_WRITEBACK_KEY))
      .get();

    if (existing) {
      db.update(settings)
        .set({ value: String(enabled) })
        .where(eq(settings.key, NFO_WRITEBACK_KEY))
        .run();
    } else {
      db.insert(settings)
        .values({ key: NFO_WRITEBACK_KEY, value: String(enabled) })
        .run();
    }

    return NextResponse.json({ enabled });
  } catch (error) {
    console.error("Update NFO writeback setting error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

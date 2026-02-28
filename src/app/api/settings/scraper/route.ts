import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateApiKey } from "@/lib/tmdb";
import { auth } from "@/lib/auth";

const TMDB_API_KEY = "tmdb_api_key";

// GET /api/settings/scraper
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const row = db.select().from(settings).where(eq(settings.key, TMDB_API_KEY)).get();
    const raw = row?.value ?? "";
    // Mask the key for display: show first 4 and last 4 chars
    const masked = raw.length > 8
      ? raw.slice(0, 4) + "..." + raw.slice(-4)
      : raw ? "****" : "";
    return NextResponse.json({ tmdbApiKey: masked, configured: !!raw });
  } catch (error) {
    console.error("Get scraper settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/settings/scraper
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tmdbApiKey } = body;

    if (!tmdbApiKey || typeof tmdbApiKey !== "string") {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    // Validate the key with TMDB
    const valid = await validateApiKey(tmdbApiKey.trim());
    if (!valid) {
      return NextResponse.json({ error: "Invalid API key", valid: false }, { status: 400 });
    }

    // Upsert into settings
    const existing = db.select().from(settings).where(eq(settings.key, TMDB_API_KEY)).get();
    if (existing) {
      db.update(settings).set({ value: tmdbApiKey.trim() }).where(eq(settings.key, TMDB_API_KEY)).run();
    } else {
      db.insert(settings).values({ key: TMDB_API_KEY, value: tmdbApiKey.trim() }).run();
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Update scraper settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

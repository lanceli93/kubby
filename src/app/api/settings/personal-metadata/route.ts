import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/settings/personal-metadata
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const row = db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, session.user.id))
      .get();

    const serverPlatform = process.platform; // "darwin" | "win32" | "linux"

    if (!row) {
      return NextResponse.json({
        movieRatingDimensions: [],
        personRatingDimensions: [],
        showMovieRatingBadge: true,
        showPersonTierBadge: true,
        showPersonRatingBadge: true,
        showResolutionBadge: true,
        externalPlayerEnabled: false,
        externalPlayerName: null,
        externalPlayerPath: null,
        externalPlayerMode: "local",
        disabledBookmarkIcons: [],
        quickBookmarkTemplate: null,
        serverPlatform,
      });
    }

    return NextResponse.json({
      movieRatingDimensions: row.movieRatingDimensions
        ? JSON.parse(row.movieRatingDimensions)
        : [],
      personRatingDimensions: row.personRatingDimensions
        ? JSON.parse(row.personRatingDimensions)
        : [],
      showMovieRatingBadge: row.showMovieRatingBadge,
      showPersonTierBadge: row.showPersonTierBadge,
      showPersonRatingBadge: row.showPersonRatingBadge,
      showResolutionBadge: row.showResolutionBadge,
      externalPlayerEnabled: row.externalPlayerEnabled,
      externalPlayerName: row.externalPlayerName,
      externalPlayerPath: row.externalPlayerPath,
      externalPlayerMode: row.externalPlayerMode ?? "local",
      disabledBookmarkIcons: row.disabledBookmarkIcons
        ? JSON.parse(row.disabledBookmarkIcons)
        : [],
      quickBookmarkTemplate: row.quickBookmarkTemplate
        ? JSON.parse(row.quickBookmarkTemplate)
        : null,
      serverPlatform,
    });
  } catch (error) {
    console.error("Get personal metadata settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/settings/personal-metadata
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const userId = session.user.id;

    // Validate dimension arrays
    if (body.movieRatingDimensions && !Array.isArray(body.movieRatingDimensions)) {
      return NextResponse.json({ error: "movieRatingDimensions must be an array" }, { status: 400 });
    }
    if (body.personRatingDimensions && !Array.isArray(body.personRatingDimensions)) {
      return NextResponse.json({ error: "personRatingDimensions must be an array" }, { status: 400 });
    }
    if (body.movieRatingDimensions?.length > 10) {
      return NextResponse.json({ error: "Maximum 10 movie rating dimensions" }, { status: 400 });
    }
    if (body.personRatingDimensions?.length > 10) {
      return NextResponse.json({ error: "Maximum 10 person rating dimensions" }, { status: 400 });
    }
    const MAX_DIM_LENGTH = 20;
    if (body.movieRatingDimensions?.some((d: string) => typeof d !== "string" || d.length > MAX_DIM_LENGTH)) {
      return NextResponse.json({ error: `Dimension name must be at most ${MAX_DIM_LENGTH} characters` }, { status: 400 });
    }
    if (body.personRatingDimensions?.some((d: string) => typeof d !== "string" || d.length > MAX_DIM_LENGTH)) {
      return NextResponse.json({ error: `Dimension name must be at most ${MAX_DIM_LENGTH} characters` }, { status: 400 });
    }

    const existing = db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .get();

    const data = {
      movieRatingDimensions: body.movieRatingDimensions !== undefined
        ? JSON.stringify(body.movieRatingDimensions)
        : existing?.movieRatingDimensions ?? "[]",
      personRatingDimensions: body.personRatingDimensions !== undefined
        ? JSON.stringify(body.personRatingDimensions)
        : existing?.personRatingDimensions ?? "[]",
      showMovieRatingBadge: body.showMovieRatingBadge !== undefined
        ? body.showMovieRatingBadge
        : existing?.showMovieRatingBadge ?? true,
      showPersonTierBadge: body.showPersonTierBadge !== undefined
        ? body.showPersonTierBadge
        : existing?.showPersonTierBadge ?? true,
      showPersonRatingBadge: body.showPersonRatingBadge !== undefined
        ? body.showPersonRatingBadge
        : existing?.showPersonRatingBadge ?? true,
      showResolutionBadge: body.showResolutionBadge !== undefined
        ? body.showResolutionBadge
        : existing?.showResolutionBadge ?? true,
      externalPlayerEnabled: body.externalPlayerEnabled !== undefined
        ? body.externalPlayerEnabled
        : existing?.externalPlayerEnabled ?? false,
      externalPlayerName: body.externalPlayerName !== undefined
        ? body.externalPlayerName
        : existing?.externalPlayerName ?? null,
      externalPlayerPath: body.externalPlayerPath !== undefined
        ? body.externalPlayerPath
        : existing?.externalPlayerPath ?? null,
      externalPlayerMode: body.externalPlayerMode !== undefined
        ? body.externalPlayerMode
        : existing?.externalPlayerMode ?? "local",
      disabledBookmarkIcons: body.disabledBookmarkIcons !== undefined
        ? JSON.stringify(body.disabledBookmarkIcons)
        : existing?.disabledBookmarkIcons ?? "[]",
      quickBookmarkTemplate: body.quickBookmarkTemplate !== undefined
        ? (body.quickBookmarkTemplate ? JSON.stringify(body.quickBookmarkTemplate) : null)
        : existing?.quickBookmarkTemplate ?? null,
    };

    if (existing) {
      db.update(userPreferences)
        .set(data)
        .where(eq(userPreferences.id, existing.id))
        .run();
    } else {
      db.insert(userPreferences)
        .values({
          id: uuidv4(),
          userId,
          ...data,
        })
        .run();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update personal metadata settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

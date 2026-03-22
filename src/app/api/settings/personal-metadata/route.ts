import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import os from "os";
import { db } from "@/lib/db";
import { userPreferences, userMovieData, userPersonData } from "@/lib/db/schema";
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

    const serverPlatform = os.platform(); // "darwin" | "win32" | "linux"

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
        subtleBookmarkMarkers: false,
        player360Mode: false,
        movieDimensionWeights: {},
        personDimensionWeights: {},
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
      subtleBookmarkMarkers: row.subtleBookmarkMarkers,
      player360Mode: row.player360Mode,
      movieDimensionWeights: row.movieDimensionWeights
        ? JSON.parse(row.movieDimensionWeights)
        : {},
      personDimensionWeights: row.personDimensionWeights
        ? JSON.parse(row.personDimensionWeights)
        : {},
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
      subtleBookmarkMarkers: body.subtleBookmarkMarkers !== undefined
        ? body.subtleBookmarkMarkers
        : existing?.subtleBookmarkMarkers ?? false,
      player360Mode: body.player360Mode !== undefined
        ? body.player360Mode
        : existing?.player360Mode ?? false,
      movieDimensionWeights: body.movieDimensionWeights !== undefined
        ? JSON.stringify(body.movieDimensionWeights)
        : existing?.movieDimensionWeights ?? "{}",
      personDimensionWeights: body.personDimensionWeights !== undefined
        ? JSON.stringify(body.personDimensionWeights)
        : existing?.personDimensionWeights ?? "{}",
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

    // Handle dimension renames: read-modify-write JSON keys in rating data
    const renames = body.renamedDimensions as { movie?: Record<string, string>; person?: Record<string, string> } | undefined;
    if (renames) {
      if (renames.movie && Object.keys(renames.movie).length > 0) {
        const rows = db.select({ id: userMovieData.id, dimensionRatings: userMovieData.dimensionRatings })
          .from(userMovieData)
          .where(eq(userMovieData.userId, userId))
          .all();
        for (const row of rows) {
          if (!row.dimensionRatings) continue;
          const ratings = JSON.parse(row.dimensionRatings) as Record<string, number>;
          let changed = false;
          for (const [oldName, newName] of Object.entries(renames.movie!)) {
            if (oldName in ratings && oldName !== newName) {
              ratings[newName] = ratings[oldName];
              delete ratings[oldName];
              changed = true;
            }
          }
          if (changed) {
            db.update(userMovieData)
              .set({ dimensionRatings: JSON.stringify(ratings) })
              .where(eq(userMovieData.id, row.id))
              .run();
          }
        }
      }
      if (renames.person && Object.keys(renames.person).length > 0) {
        const rows = db.select({ id: userPersonData.id, dimensionRatings: userPersonData.dimensionRatings })
          .from(userPersonData)
          .where(eq(userPersonData.userId, userId))
          .all();
        for (const row of rows) {
          if (!row.dimensionRatings) continue;
          const ratings = JSON.parse(row.dimensionRatings) as Record<string, number>;
          let changed = false;
          for (const [oldName, newName] of Object.entries(renames.person!)) {
            if (oldName in ratings && oldName !== newName) {
              ratings[newName] = ratings[oldName];
              delete ratings[oldName];
              changed = true;
            }
          }
          if (changed) {
            db.update(userPersonData)
              .set({ dimensionRatings: JSON.stringify(ratings) })
              .where(eq(userPersonData.id, row.id))
              .run();
          }
        }
      }
    }

    // Recalculate personalRating using current weights + dimensions
    const movieDims: string[] = body.movieRatingDimensions ?? (existing?.movieRatingDimensions ? JSON.parse(existing.movieRatingDimensions) : []);
    const personDims: string[] = body.personRatingDimensions ?? (existing?.personRatingDimensions ? JSON.parse(existing.personRatingDimensions) : []);
    const movieWeights: Record<string, number> = body.movieDimensionWeights ?? (existing?.movieDimensionWeights ? JSON.parse(existing.movieDimensionWeights) : {});
    const personWeights: Record<string, number> = body.personDimensionWeights ?? (existing?.personDimensionWeights ? JSON.parse(existing.personDimensionWeights) : {});

    if (movieDims.length > 0) {
      const rows = db.select({ id: userMovieData.id, dimensionRatings: userMovieData.dimensionRatings })
        .from(userMovieData)
        .where(eq(userMovieData.userId, userId))
        .all();
      for (const row of rows) {
        if (!row.dimensionRatings) continue;
        const ratings = JSON.parse(row.dimensionRatings) as Record<string, number>;
        let weightedSum = 0, weightSum = 0;
        for (const dim of movieDims) {
          const val = ratings[dim];
          if (val != null && val > 0) {
            const w = movieWeights[dim] ?? 1;
            weightedSum += val * w;
            weightSum += w;
          }
        }
        const avg = weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : null;
        db.update(userMovieData)
          .set({ personalRating: avg })
          .where(eq(userMovieData.id, row.id))
          .run();
      }
    }
    if (personDims.length > 0) {
      const rows = db.select({ id: userPersonData.id, dimensionRatings: userPersonData.dimensionRatings })
        .from(userPersonData)
        .where(eq(userPersonData.userId, userId))
        .all();
      for (const row of rows) {
        if (!row.dimensionRatings) continue;
        const ratings = JSON.parse(row.dimensionRatings) as Record<string, number>;
        let weightedSum = 0, weightSum = 0;
        for (const dim of personDims) {
          const val = ratings[dim];
          if (val != null && val > 0) {
            const w = personWeights[dim] ?? 1;
            weightedSum += val * w;
            weightSum += w;
          }
        }
        const avg = weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : null;
        db.update(userPersonData)
          .set({ personalRating: avg })
          .where(eq(userPersonData.id, row.id))
          .run();
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update personal metadata settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

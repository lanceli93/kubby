import { NextRequest, NextResponse } from "next/server";
import nodePath from "path";
import fs from "fs/promises";
import { db } from "@/lib/db";
import {
  tvShows,
  tvSeasons,
  tvEpisodes,
  tvShowPeople,
  tvPeople,
  userEpisodeData,
  userTvShowData,
  userTvPersonData,
  mediaLibraries,
  settings,
} from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { writeTvShowNfo, type NfoTvShowData } from "@/lib/scanner/nfo-writer";
import { computeAgeAtRelease } from "@/lib/scanner";
import { resolveDataPath } from "@/lib/paths";

/** Build a cache-bust stamped path using a pre-stored mtime value (no filesystem I/O). */
const stampPath = (p: string | null, mtime?: number | null) => {
  if (!p) return null;
  return mtime ? `${p}|${mtime}` : p;
};

// GET /api/tv/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const show = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
    if (!show) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const session = await auth();
    const userId = session?.user?.id;

    // Seasons for this show, ordered.
    const seasonRows = db
      .select()
      .from(tvSeasons)
      .where(eq(tvSeasons.showId, id))
      .orderBy(asc(tvSeasons.seasonNumber))
      .all();

    // All episodes for this show, ordered, with this user's watch state joined.
    const episodeRows = db
      .select({
        id: tvEpisodes.id,
        showId: tvEpisodes.showId,
        seasonId: tvEpisodes.seasonId,
        seasonNumber: tvEpisodes.seasonNumber,
        episodeNumber: tvEpisodes.episodeNumber,
        episodeNumberEnd: tvEpisodes.episodeNumberEnd,
        absoluteNumber: tvEpisodes.absoluteNumber,
        title: tvEpisodes.title,
        overview: tvEpisodes.overview,
        stillPath: tvEpisodes.stillPath,
        stillMtime: tvEpisodes.stillMtime,
        stillBlur: tvEpisodes.stillBlur,
        airDate: tvEpisodes.airDate,
        communityRating: tvEpisodes.communityRating,
        runtimeSeconds: tvEpisodes.runtimeSeconds,
        runtimeMinutes: tvEpisodes.runtimeMinutes,
        videoWidth: tvEpisodes.videoWidth,
        videoHeight: tvEpisodes.videoHeight,
        videoCodec: tvEpisodes.videoCodec,
        fileSize: tvEpisodes.fileSize,
        dateAdded: tvEpisodes.dateAdded,
        isPlayed: userEpisodeData.isPlayed,
        playbackPositionSeconds: userEpisodeData.playbackPositionSeconds,
        personalRating: userEpisodeData.personalRating,
      })
      .from(tvEpisodes)
      .leftJoin(
        userEpisodeData,
        and(
          eq(userEpisodeData.episodeId, tvEpisodes.id),
          userId ? eq(userEpisodeData.userId, userId) : sql`0`
        )
      )
      .where(eq(tvEpisodes.showId, id))
      .orderBy(asc(tvEpisodes.seasonNumber), asc(tvEpisodes.episodeNumber))
      .all();

    // Group episodes under their season (by seasonId).
    const episodesBySeason = new Map<string, unknown[]>();
    for (const e of episodeRows) {
      const runtimeSeconds =
        e.runtimeSeconds || (e.runtimeMinutes ? e.runtimeMinutes * 60 : 0);
      const position = e.playbackPositionSeconds ?? 0;
      const progress =
        runtimeSeconds && position
          ? Math.min(100, Math.round((position / runtimeSeconds) * 100))
          : 0;
      const shaped = {
        ...e,
        stillPath: stampPath(
          e.stillPath ? nodePath.join(show.folderPath, e.stillPath) : null,
          e.stillMtime
        ),
        stillBlur: e.stillBlur,
        isPlayed: e.isPlayed ?? false,
        playbackPositionSeconds: position,
        progress,
      };
      const list = episodesBySeason.get(e.seasonId) ?? [];
      list.push(shaped);
      episodesBySeason.set(e.seasonId, list);
    }

    // Nested shape: seasons with their episodes.
    const seasons = seasonRows.map((s) => ({
      ...s,
      posterPath: stampPath(
        s.posterPath ? nodePath.join(show.folderPath, s.posterPath) : null,
        s.posterMtime
      ),
      posterBlur: s.posterBlur,
      episodes: episodesBySeason.get(s.id) ?? [],
    }));

    // Cast (actors) ordered by sortOrder. Left-join this user's per-person data
    // (favorite / rating) from the ISOLATED user_tv_person_data table so cast
    // cards can show + toggle favorites — never touching the cinema tables.
    const cast = db
      .select({
        id: tvPeople.id,
        name: tvPeople.name,
        role: tvShowPeople.role,
        photoPath: tvPeople.photoPath,
        photoMtime: tvPeople.photoMtime,
        photoBlur: tvPeople.photoBlur,
        sortOrder: tvShowPeople.sortOrder,
        ageAtRelease: tvShowPeople.ageAtRelease,
        personalRating: userTvPersonData.personalRating,
        isFavorite: userTvPersonData.isFavorite,
      })
      .from(tvShowPeople)
      .innerJoin(tvPeople, eq(tvShowPeople.personId, tvPeople.id))
      .leftJoin(
        userTvPersonData,
        and(
          eq(userTvPersonData.personId, tvPeople.id),
          userId ? eq(userTvPersonData.userId, userId) : sql`0`
        )
      )
      .where(and(eq(tvShowPeople.showId, id), eq(tvPeople.type, "actor")))
      .orderBy(asc(tvShowPeople.sortOrder))
      .all();

    // Directors.
    const directors = db
      .select({
        id: tvPeople.id,
        name: tvPeople.name,
      })
      .from(tvShowPeople)
      .innerJoin(tvPeople, eq(tvShowPeople.personId, tvPeople.id))
      .where(and(eq(tvShowPeople.showId, id), eq(tvPeople.type, "director")))
      .orderBy(asc(tvShowPeople.sortOrder))
      .all();

    // All people (for metadata editor cast tab) — every type, ordered.
    const allPeople = db
      .select({
        id: tvPeople.id,
        name: tvPeople.name,
        type: tvPeople.type,
        role: tvShowPeople.role,
        sortOrder: tvShowPeople.sortOrder,
      })
      .from(tvShowPeople)
      .innerJoin(tvPeople, eq(tvShowPeople.personId, tvPeople.id))
      .where(eq(tvShowPeople.showId, id))
      .orderBy(asc(tvShowPeople.sortOrder))
      .all();

    // User show data (favorite / rating / dimension ratings).
    let userData = null;
    if (userId) {
      const row = db
        .select()
        .from(userTvShowData)
        .where(and(eq(userTvShowData.userId, userId), eq(userTvShowData.showId, id)))
        .get();
      userData = row
        ? {
            isFavorite: row.isFavorite ?? false,
            personalRating: row.personalRating,
            dimensionRatings: row.dimensionRatings ? JSON.parse(row.dimensionRatings) : null,
          }
        : null;
    }

    const posterPath = show.posterPath
      ? nodePath.join(show.folderPath, show.posterPath)
      : null;
    const fanartPath = show.fanartPath
      ? nodePath.join(show.folderPath, show.fanartPath)
      : null;

    return NextResponse.json({
      ...show,
      posterPath: stampPath(posterPath, show.posterMtime),
      posterBlur: show.posterBlur,
      fanartPath: stampPath(fanartPath, show.fanartMtime),
      genres: show.genres ? JSON.parse(show.genres) : [],
      studios: show.studios ? JSON.parse(show.studios) : [],
      // country is stored as a plain string (origin_country[0], e.g. "US"),
      // not a JSON array — wrap it so the client always gets string[].
      country: show.country ? [show.country] : [],
      tags: show.tags ? JSON.parse(show.tags) : [],
      seasons,
      cast: cast.map((c) => ({
        ...c,
        photoPath: stampPath(c.photoPath ? resolveDataPath(c.photoPath) : null, c.photoMtime),
        photoBlur: c.photoBlur,
      })),
      directors,
      allPeople,
      userData,
    });
  } catch (error) {
    console.error("Get tv show error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/tv/[id]
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
    const show = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
    if (!show) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();

    // Build update object from allowed fields.
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.originalTitle !== undefined) updateData.originalTitle = body.originalTitle;
    if (body.sortName !== undefined) updateData.sortName = body.sortName;
    if (body.overview !== undefined) updateData.overview = body.overview;
    if (body.tagline !== undefined) updateData.tagline = body.tagline;
    if (body.year !== undefined) updateData.year = body.year ? Number(body.year) : null;
    if (body.premiereDate !== undefined) updateData.premiereDate = body.premiereDate;
    if (body.communityRating !== undefined) updateData.communityRating = body.communityRating ? Number(body.communityRating) : null;
    if (body.officialRating !== undefined) updateData.officialRating = body.officialRating;
    // country is a plain string for tv (origin_country[0]), stored as-is.
    if (body.country !== undefined) updateData.country = body.country;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.genres !== undefined) updateData.genres = JSON.stringify(body.genres);
    if (body.studios !== undefined) updateData.studios = JSON.stringify(body.studios);
    if (body.tags !== undefined) updateData.tags = JSON.stringify(body.tags);
    if (body.tmdbId !== undefined) updateData.tmdbId = body.tmdbId;
    if (body.imdbId !== undefined) updateData.imdbId = body.imdbId;
    if (body.tvdbId !== undefined) updateData.tvdbId = body.tvdbId;

    if (Object.keys(updateData).length > 0) {
      db.update(tvShows).set(updateData).where(eq(tvShows.id, id)).run();
    }

    // Handle cast updates — replace tvShowPeople rows against the ISOLATED
    // tv_people / tv_show_people tables (never touch cinema people).
    if (body.cast !== undefined && Array.isArray(body.cast)) {
      db.delete(tvShowPeople).where(eq(tvShowPeople.showId, id)).run();

      for (let i = 0; i < body.cast.length; i++) {
        const entry = body.cast[i];
        const name = (entry.name || "").trim();
        const type = entry.type || "actor";
        const role = entry.role || "";
        if (!name) continue;

        // Find existing tv person by name + type, or create new.
        let person = db
          .select()
          .from(tvPeople)
          .where(and(eq(tvPeople.name, name), eq(tvPeople.type, type)))
          .get();

        if (!person) {
          const personId = crypto.randomUUID();
          db.insert(tvPeople)
            .values({ id: personId, name, type })
            .run();
          person = db.select().from(tvPeople).where(eq(tvPeople.id, personId)).get()!;
        }

        const age = computeAgeAtRelease(person.birthDate, show.premiereDate, show.year, person.birthYear);
        db.insert(tvShowPeople)
          .values({
            id: crypto.randomUUID(),
            showId: id,
            personId: person.id,
            role,
            sortOrder: i,
            ageAtRelease: age,
          })
          .run();
      }
    }

    // Re-read updated show.
    const updated = db.select().from(tvShows).where(eq(tvShows.id, id)).get()!;

    // Regenerate tvshow NFO (best-effort; skip in Jellyfin compat mode or when
    // writeback is disabled). A writeback failure must not fail the request.
    try {
      const showLibrary = db.select().from(mediaLibraries).where(eq(mediaLibraries.id, updated.mediaLibraryId)).get();
      const nfoWritebackRow = db.select().from(settings).where(eq(settings.key, "nfo_writeback_enabled")).get();
      const nfoWritebackEnabled = nfoWritebackRow ? nfoWritebackRow.value === "true" : true;
      if (updated.nfoPath && !showLibrary?.jellyfinCompat && nfoWritebackEnabled) {
        const nfoFullPath = nodePath.join(updated.folderPath, updated.nfoPath);

        const actors = db
          .select({
            name: tvPeople.name,
            role: tvShowPeople.role,
            photoPath: tvPeople.photoPath,
            sortOrder: tvShowPeople.sortOrder,
          })
          .from(tvShowPeople)
          .innerJoin(tvPeople, eq(tvShowPeople.personId, tvPeople.id))
          .where(and(eq(tvShowPeople.showId, id), eq(tvPeople.type, "actor")))
          .orderBy(asc(tvShowPeople.sortOrder))
          .all();

        const nfoData: NfoTvShowData = {
          title: updated.title,
          originalTitle: updated.originalTitle || undefined,
          sortTitle: updated.sortName || undefined,
          overview: updated.overview || undefined,
          tagline: updated.tagline || undefined,
          rating: updated.communityRating || undefined,
          mpaa: updated.officialRating || undefined,
          premiered: updated.premiereDate || undefined,
          year: updated.year || undefined,
          status: updated.status || undefined,
          genres: updated.genres ? JSON.parse(updated.genres) : undefined,
          studios: updated.studios ? JSON.parse(updated.studios) : undefined,
          country: updated.country || undefined,
          tmdbId: updated.tmdbId || undefined,
          imdbId: updated.imdbId || undefined,
          tvdbId: updated.tvdbId || undefined,
          actors: actors.map((a) => ({
            name: a.name,
            role: a.role || "",
            thumb: a.photoPath || undefined,
            order: a.sortOrder || 0,
          })),
          tags: updated.tags ? JSON.parse(updated.tags) : undefined,
        };
        writeTvShowNfo(nfoFullPath, nfoData);
      }
    } catch (nfoError) {
      console.error("TV show NFO writeback failed:", nfoError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update tv show error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/tv/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deleteFiles = request.nextUrl.searchParams.get("deleteFiles") === "true";

  try {
    const show = db.select().from(tvShows).where(eq(tvShows.id, id)).get();
    if (!show) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Cascade removes seasons/episodes/streams/showPeople. Orphan tvPeople
    // cleanup is handled by the library delete route, not here.
    db.delete(tvShows).where(eq(tvShows.id, id)).run();

    if (deleteFiles && show.folderPath) {
      try {
        await fs.rm(show.folderPath, { recursive: true, force: true });
      } catch (fsError) {
        console.error("Failed to delete tv show folder:", show.folderPath, fsError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete tv show error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

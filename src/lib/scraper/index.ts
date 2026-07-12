import path from "path";
import {
  searchMovie,
  getMovieDetails,
  fetchMovieImages,
  pickBestBackdrop,
  fetchPersonDetails,
  downloadTmdbImage,
  getPersonPhotoPath,
  sanitizePersonName,
  searchTv,
  getTvDetails,
  getTvSeasonDetails,
  TMDB_POSTER_SIZE,
  TMDB_BACKDROP_SIZE,
  TMDB_PROFILE_SIZE,
  TMDB_STILL_SIZE,
} from "@/lib/tmdb";
import { writeFullNfo, writeTvShowNfo } from "@/lib/scanner/nfo-writer";
import { parseFolderName } from "./folder-parser";

const RATE_LIMIT_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ScrapedActorBio {
  name: string;
  tmdbId: number;
  birthday?: string;
  deathday?: string;
  biography?: string;
  placeOfBirth?: string;
  imdbId?: string;
}

export interface ScrapeResult {
  success: boolean;
  title?: string;
  error?: string;
  actorBios?: ScrapedActorBio[];
}

/**
 * Scrape metadata for a single movie directory from TMDB.
 * Generates movie.nfo, downloads poster.jpg and fanart.jpg.
 */
export async function scrapeMovie(
  movieDir: string,
  apiKey: string,
  metadataDir: string,
  language?: string
): Promise<ScrapeResult> {
  const folderName = path.basename(movieDir);
  const { title, year } = parseFolderName(folderName);

  try {
    // 1. Search TMDB
    const results = await searchMovie(title, year, apiKey, language);
    await delay(RATE_LIMIT_MS);

    if (results.length === 0) {
      return { success: false, error: `No TMDB results for "${title}"` };
    }

    // Pick best match: prefer exact year match, otherwise first result
    let bestMatch = results[0];
    if (year) {
      const yearMatch = results.find((r) => r.release_date?.startsWith(String(year)));
      if (yearMatch) bestMatch = yearMatch;
    }

    // 2. Get full details
    const details = await getMovieDetails(bestMatch.id, apiKey, language);
    await delay(RATE_LIMIT_MS);

    // 3. Download poster
    if (details.poster_path) {
      try {
        await downloadTmdbImage(
          details.poster_path,
          path.join(movieDir, "poster.jpg"),
          TMDB_POSTER_SIZE
        );
      } catch (e) {
        console.warn(`Failed to download poster for ${title}:`, e);
      }
    }

    // 4. Download backdrop/fanart — pick the best from all available backdrops
    try {
      const images = await fetchMovieImages(bestMatch.id, apiKey);
      await delay(RATE_LIMIT_MS);
      const bestBackdrop = pickBestBackdrop(images, details.backdrop_path);
      if (bestBackdrop) {
        await downloadTmdbImage(
          bestBackdrop,
          path.join(movieDir, "fanart.jpg"),
          TMDB_BACKDROP_SIZE
        );
      }
    } catch (e) {
      // Fallback to default backdrop_path if images endpoint fails
      if (details.backdrop_path) {
        try {
          await downloadTmdbImage(
            details.backdrop_path,
            path.join(movieDir, "fanart.jpg"),
            TMDB_BACKDROP_SIZE
          );
        } catch (e2) {
          console.warn(`Failed to download fanart for ${title}:`, e2);
        }
      }
    }

    // 5. Download actor photos and fetch person details
    const topCast = (details.credits?.cast ?? []).slice(0, 20);
    const actorPersonDetails: Map<number, { birthday: string | null; deathday: string | null; biography: string; placeOfBirth: string | null; imdbId: string | null }> = new Map();

    for (const actor of topCast) {
      if (actor.profile_path) {
        try {
          const photoPath = getPersonPhotoPath(metadataDir, actor.name);
          await downloadTmdbImage(actor.profile_path, photoPath, TMDB_PROFILE_SIZE);
        } catch {
          // non-critical, skip
        }
      }
      // Fetch person biography details
      try {
        const personDetails = await fetchPersonDetails(actor.id, apiKey, language);
        actorPersonDetails.set(actor.id, {
          birthday: personDetails.birthday,
          deathday: personDetails.deathday,
          biography: personDetails.biography,
          placeOfBirth: personDetails.place_of_birth,
          imdbId: personDetails.imdb_id,
        });
        await delay(RATE_LIMIT_MS);
      } catch {
        // non-critical, skip person details
      }
    }

    // 6. Build actors list for NFO (with local thumb paths and bio data)
    const actors = topCast.map((actor) => {
      const bio = actorPersonDetails.get(actor.id);
      return {
        name: actor.name,
        role: actor.character,
        thumb: actor.profile_path
          ? getPersonPhotoPath(metadataDir, actor.name)
          : undefined,
        order: actor.order,
        tmdbId: actor.id,
        birthday: bio?.birthday ?? undefined,
        deathday: bio?.deathday ?? undefined,
        biography: bio?.biography ?? undefined,
        placeOfBirth: bio?.placeOfBirth ?? undefined,
        imdbId: bio?.imdbId ?? undefined,
      };
    });

    // 7. Extract directors
    const directors = (details.credits?.crew ?? [])
      .filter((c) => c.job === "Director")
      .map((c) => c.name);

    // 8. Extract keywords as tags
    const tags = (details.keywords?.keywords ?? []).map((k) => k.name);

    // 9. Generate NFO
    const releaseYear = details.release_date
      ? parseInt(details.release_date.split("-")[0], 10)
      : undefined;

    writeFullNfo(path.join(movieDir, "movie.nfo"), {
      title: details.title,
      originalTitle: details.original_title,
      overview: details.overview,
      tagline: details.tagline,
      rating: details.vote_average,
      runtime: details.runtime,
      premiered: details.release_date,
      year: releaseYear,
      genres: details.genres.map((g) => g.name),
      studios: details.production_companies.map((c) => c.name),
      country: details.production_countries[0]?.name,
      tmdbId: String(details.id),
      imdbId: details.imdb_id || undefined,
      actors,
      directors,
      tags,
    });

    // Collect actor bios for the scanner to store in DB
    const actorBios: ScrapedActorBio[] = topCast
      .filter((actor) => actorPersonDetails.has(actor.id))
      .map((actor) => {
        const bio = actorPersonDetails.get(actor.id)!;
        return {
          name: actor.name,
          tmdbId: actor.id,
          birthday: bio.birthday ?? undefined,
          deathday: bio.deathday ?? undefined,
          biography: bio.biography ?? undefined,
          placeOfBirth: bio.placeOfBirth ?? undefined,
          imdbId: bio.imdbId ?? undefined,
        };
      });

    return { success: true, title: details.title, actorBios };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Scrape failed for "${title}": ${msg}` };
  }
}

// ─── TV Show scraping ──────────────────────────────────────────

/** A season present on disk that the scraper should fetch metadata for. */
export interface TvSeasonOnDisk {
  seasonNumber: number;
}

/** Per-episode metadata resolved from TMDB (stillPath = local, relative to showDir). */
export interface ScrapedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  name?: string;
  overview?: string;
  airDate?: string;
  stillPath?: string; // local path relative to showDir, or undefined
  runtime?: number; // minutes
  voteAverage?: number;
}

/** Per-season metadata resolved from TMDB (posterPath = local, relative to showDir). */
export interface ScrapedSeason {
  seasonNumber: number;
  name?: string;
  overview?: string;
  posterPath?: string; // local path relative to showDir, or undefined
  airDate?: string;
  episodes: ScrapedEpisode[];
}

export interface ScrapeTvResult {
  success: boolean;
  title?: string;
  error?: string;
  tmdbId?: number;
  actorBios?: ScrapedActorBio[];
  seasons?: ScrapedSeason[];
}

/** Zero-pad a season number to two digits for on-disk poster names. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Scrape metadata for a single TV show directory from TMDB.
 * Generates tvshow.nfo, downloads poster.jpg / fanart.jpg, per-season posters
 * (season{NN}-poster.jpg) and per-episode stills (.stills/S{NN}E{MM}.jpg).
 * Episode NFO placement is left to the scanner (which knows the video paths);
 * this returns per-season/episode metadata + local still paths for it to persist.
 */
export async function scrapeTvShow(
  showDir: string,
  apiKey: string,
  metadataDir: string,
  language: string | undefined,
  seasonsOnDisk: TvSeasonOnDisk[]
): Promise<ScrapeTvResult> {
  const folderName = path.basename(showDir);
  const { title, year } = parseFolderName(folderName);

  try {
    // 1. Search TMDB
    const results = await searchTv(title, year, apiKey, language);
    await delay(RATE_LIMIT_MS);

    if (results.length === 0) {
      return { success: false, error: `No TMDB TV results for "${title}"` };
    }

    // Pick best match: prefer exact first-air-year match, otherwise first result
    let bestMatch = results[0];
    if (year) {
      const yearMatch = results.find((r) => r.first_air_date?.startsWith(String(year)));
      if (yearMatch) bestMatch = yearMatch;
    }

    // 2. Get full details
    const details = await getTvDetails(bestMatch.id, apiKey, language);
    await delay(RATE_LIMIT_MS);

    // 3. Download show poster
    if (details.poster_path) {
      try {
        await downloadTmdbImage(
          details.poster_path,
          path.join(showDir, "poster.jpg"),
          TMDB_POSTER_SIZE
        );
      } catch (e) {
        console.warn(`Failed to download poster for ${title}:`, e);
      }
    }

    // 4. Download backdrop/fanart — TV has no dedicated images endpoint here, so
    //    just use the details.backdrop_path (kept non-fatal like scrapeMovie).
    if (details.backdrop_path) {
      try {
        await downloadTmdbImage(
          details.backdrop_path,
          path.join(showDir, "fanart.jpg"),
          TMDB_BACKDROP_SIZE
        );
      } catch (e) {
        console.warn(`Failed to download fanart for ${title}:`, e);
      }
    }

    // 5. Download actor photos and fetch person details
    const topCast = (details.credits?.cast ?? []).slice(0, 20);
    const actorPersonDetails: Map<number, { birthday: string | null; deathday: string | null; biography: string; placeOfBirth: string | null; imdbId: string | null }> = new Map();

    for (const actor of topCast) {
      if (actor.profile_path) {
        try {
          const photoPath = getPersonPhotoPath(metadataDir, actor.name);
          await downloadTmdbImage(actor.profile_path, photoPath, TMDB_PROFILE_SIZE);
        } catch {
          // non-critical, skip
        }
      }
      // Fetch person biography details
      try {
        const personDetails = await fetchPersonDetails(actor.id, apiKey, language);
        actorPersonDetails.set(actor.id, {
          birthday: personDetails.birthday,
          deathday: personDetails.deathday,
          biography: personDetails.biography,
          placeOfBirth: personDetails.place_of_birth,
          imdbId: personDetails.imdb_id,
        });
        await delay(RATE_LIMIT_MS);
      } catch {
        // non-critical, skip person details
      }
    }

    // 6. Build actors list for NFO (with local thumb paths)
    const actors = topCast.map((actor) => ({
      name: actor.name,
      role: actor.character,
      thumb: actor.profile_path
        ? getPersonPhotoPath(metadataDir, actor.name)
        : undefined,
      order: actor.order,
      tmdbId: actor.id,
    }));

    // 7. Extract keywords as tags
    const tags = (details.keywords?.results ?? []).map((k) => k.name);

    // 8. Generate tvshow.nfo
    const releaseYear = details.first_air_date
      ? parseInt(details.first_air_date.split("-")[0], 10)
      : undefined;

    writeTvShowNfo(path.join(showDir, "tvshow.nfo"), {
      title: details.name,
      originalTitle: details.original_name,
      overview: details.overview,
      tagline: details.tagline,
      rating: details.vote_average,
      premiered: details.first_air_date,
      year: releaseYear,
      status: details.status,
      genres: details.genres.map((g) => g.name),
      studios: details.production_companies.map((c) => c.name),
      country: details.origin_country[0],
      tmdbId: String(details.id),
      imdbId: details.external_ids?.imdb_id || undefined,
      tvdbId: details.external_ids?.tvdb_id != null ? String(details.external_ids.tvdb_id) : undefined,
      actors,
      tags,
    });

    // 9. Collect actor bios for the scanner to store in DB
    const actorBios: ScrapedActorBio[] = topCast
      .filter((actor) => actorPersonDetails.has(actor.id))
      .map((actor) => {
        const bio = actorPersonDetails.get(actor.id)!;
        return {
          name: actor.name,
          tmdbId: actor.id,
          birthday: bio.birthday ?? undefined,
          deathday: bio.deathday ?? undefined,
          biography: bio.biography ?? undefined,
          placeOfBirth: bio.placeOfBirth ?? undefined,
          imdbId: bio.imdbId ?? undefined,
        };
      });

    // 10. Per-season metadata: season poster + per-episode stills.
    const stillsDir = path.join(showDir, ".stills");
    const seasons: ScrapedSeason[] = [];
    for (const { seasonNumber } of seasonsOnDisk) {
      let seasonDetails;
      try {
        seasonDetails = await getTvSeasonDetails(details.id, seasonNumber, apiKey, language);
        await delay(RATE_LIMIT_MS);
      } catch (e) {
        console.warn(`Failed to fetch season ${seasonNumber} for ${title}:`, e);
        seasons.push({ seasonNumber, episodes: [] });
        continue;
      }

      // Season poster → season{NN}-poster.jpg (relative to showDir)
      let seasonPosterRel: string | undefined;
      if (seasonDetails.poster_path) {
        const seasonPosterName = `season${pad2(seasonNumber)}-poster.jpg`;
        try {
          await downloadTmdbImage(
            seasonDetails.poster_path,
            path.join(showDir, seasonPosterName),
            TMDB_POSTER_SIZE
          );
          seasonPosterRel = seasonPosterName;
        } catch (e) {
          console.warn(`Failed to download season ${seasonNumber} poster for ${title}:`, e);
        }
      }

      const episodes: ScrapedEpisode[] = [];
      for (const ep of seasonDetails.episodes ?? []) {
        // Episode still → .stills/S{NN}E{MM}.jpg (relative to showDir)
        let stillRel: string | undefined;
        if (ep.still_path) {
          const stillName = `S${pad2(ep.season_number)}E${pad2(ep.episode_number)}.jpg`;
          try {
            await downloadTmdbImage(
              ep.still_path,
              path.join(stillsDir, stillName),
              TMDB_STILL_SIZE
            );
            stillRel = path.join(".stills", stillName);
          } catch (e) {
            console.warn(`Failed to download still S${pad2(ep.season_number)}E${pad2(ep.episode_number)} for ${title}:`, e);
          }
        }
        episodes.push({
          seasonNumber: ep.season_number,
          episodeNumber: ep.episode_number,
          name: ep.name || undefined,
          overview: ep.overview || undefined,
          airDate: ep.air_date || undefined,
          stillPath: stillRel,
          runtime: ep.runtime ?? undefined,
          voteAverage: ep.vote_average,
        });
      }

      seasons.push({
        seasonNumber,
        name: seasonDetails.name || undefined,
        overview: seasonDetails.overview || undefined,
        posterPath: seasonPosterRel,
        airDate: seasonDetails.air_date || undefined,
        episodes,
      });
    }

    return { success: true, title: details.name, tmdbId: details.id, actorBios, seasons };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `TV scrape failed for "${title}": ${msg}` };
  }
}

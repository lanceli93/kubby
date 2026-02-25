import path from "path";
import {
  searchMovie,
  getMovieDetails,
  fetchPersonDetails,
  downloadTmdbImage,
  getPersonPhotoPath,
  sanitizePersonName,
  TMDB_POSTER_SIZE,
  TMDB_BACKDROP_SIZE,
  TMDB_PROFILE_SIZE,
} from "@/lib/tmdb";
import { writeFullNfo } from "@/lib/scanner/nfo-writer";
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

    // 4. Download backdrop/fanart
    if (details.backdrop_path) {
      try {
        await downloadTmdbImage(
          details.backdrop_path,
          path.join(movieDir, "fanart.jpg"),
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

    // 8. Generate NFO
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

import path from "path";
import {
  searchMovie,
  getMovieDetails,
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

export interface ScrapeResult {
  success: boolean;
  title?: string;
  error?: string;
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

    // 5. Download actor photos
    const topCast = (details.credits?.cast ?? []).slice(0, 20);
    for (const actor of topCast) {
      if (actor.profile_path) {
        try {
          const photoPath = getPersonPhotoPath(metadataDir, actor.name);
          await downloadTmdbImage(actor.profile_path, photoPath, TMDB_PROFILE_SIZE);
        } catch {
          // non-critical, skip
        }
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
    }));

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

    return { success: true, title: details.title };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Scrape failed for "${title}": ${msg}` };
  }
}

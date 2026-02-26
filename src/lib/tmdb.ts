import fs from "fs";
import path from "path";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

// ─── Rate-limit-aware fetch with retry ─────────────────────────
const MAX_RETRIES = 3;
const DEFAULT_RETRY_MS = 2000;

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  const res = await fetch(url);
  if (res.status === 429 && retries > 0) {
    const retryAfter = res.headers.get("Retry-After");
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : DEFAULT_RETRY_MS;
    console.warn(`TMDB rate limited, retrying in ${waitMs}ms (${retries} retries left)`);
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchWithRetry(url, retries - 1);
  }
  return res;
}

export const TMDB_POSTER_SIZE = "w500";
export const TMDB_BACKDROP_SIZE = "w1280";
export const TMDB_PROFILE_SIZE = "w185";

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TmdbCredits {
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

export async function fetchMovieCredits(
  tmdbId: string,
  apiKey: string,
  language?: string
): Promise<TmdbCredits> {
  let url = `${TMDB_BASE_URL}/movie/${tmdbId}/credits?api_key=${apiKey}`;
  if (language) url += `&language=${encodeURIComponent(language)}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`TMDb API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function getImageUrl(profilePath: string, size: string = TMDB_PROFILE_SIZE): string {
  return `${TMDB_IMAGE_BASE}/${size}${profilePath}`;
}

// ─── Person Details ──────────────────────────────────────────

export interface TmdbPersonDetails {
  id: number;
  name: string;
  birthday: string | null;
  deathday: string | null;
  biography: string;
  place_of_birth: string | null;
  imdb_id: string | null;
  profile_path: string | null;
}

export async function fetchPersonDetails(
  tmdbPersonId: number,
  apiKey: string,
  language?: string
): Promise<TmdbPersonDetails> {
  let url = `${TMDB_BASE_URL}/person/${tmdbPersonId}?api_key=${apiKey}`;
  if (language) url += `&language=${encodeURIComponent(language)}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`TMDb person API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// ─── Search & Details ──────────────────────────────────────────

export interface TmdbSearchResult {
  id: number;
  title: string;
  release_date: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  tagline: string;
  vote_average: number;
  runtime: number;
  release_date: string;
  genres: { id: number; name: string }[];
  production_companies: { id: number; name: string }[];
  production_countries: { iso_3166_1: string; name: string }[];
  imdb_id: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  credits: TmdbCredits;
  keywords: { keywords: { id: number; name: string }[] };
}

export async function searchMovie(
  query: string,
  year: number | undefined,
  apiKey: string,
  language?: string
): Promise<TmdbSearchResult[]> {
  let url = `${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}`;
  if (year) url += `&year=${year}`;
  if (language) url += `&language=${encodeURIComponent(language)}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`TMDb search error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.results ?? [];
}

export async function getMovieDetails(
  tmdbId: number,
  apiKey: string,
  language?: string
): Promise<TmdbMovieDetails> {
  let url = `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits,keywords`;
  if (language) url += `&language=${encodeURIComponent(language)}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`TMDb details error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ─── Movie Images (for best backdrop selection) ────────────────

export interface TmdbImage {
  aspect_ratio: number;
  height: number;
  width: number;
  iso_639_1: string | null;
  file_path: string;
  vote_average: number;
  vote_count: number;
}

export interface TmdbMovieImages {
  backdrops: TmdbImage[];
  posters: TmdbImage[];
  logos: TmdbImage[];
}

export async function fetchMovieImages(
  tmdbId: number,
  apiKey: string
): Promise<TmdbMovieImages> {
  // No language param — this returns images in ALL languages
  const url = `${TMDB_BASE_URL}/movie/${tmdbId}/images?api_key=${apiKey}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`TMDb images error: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Select the best backdrop from TMDB images.
 * Priority: no-text images (iso_639_1 is null) with highest vote_average.
 * Falls back to the default backdrop_path if no good candidate.
 */
export function pickBestBackdrop(
  images: TmdbMovieImages,
  fallbackPath: string | null
): string | null {
  const backdrops = images.backdrops;
  if (!backdrops || backdrops.length === 0) return fallbackPath;

  // Prefer textless backdrops (iso_639_1 === null), sorted by vote_average desc
  const textless = backdrops
    .filter((img) => img.iso_639_1 === null)
    .sort((a, b) => b.vote_average - a.vote_average || b.vote_count - a.vote_count);

  if (textless.length > 0) return textless[0].file_path;

  // Fall back to highest-voted backdrop regardless of language
  const sorted = [...backdrops].sort(
    (a, b) => b.vote_average - a.vote_average || b.vote_count - a.vote_count
  );
  return sorted[0].file_path;
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const url = `${TMDB_BASE_URL}/configuration?api_key=${apiKey}`;
    const res = await fetchWithRetry(url);
    return res.ok;
  } catch {
    return false;
  }
}

export async function downloadTmdbImage(
  tmdbPath: string,
  destPath: string,
  size: string
): Promise<boolean> {
  const url = getImageUrl(tmdbPath, size);
  return downloadImage(url, destPath);
}

export async function downloadImage(
  url: string,
  destPath: string
): Promise<boolean> {
  if (fs.existsSync(destPath)) return false;

  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return true;
}

export function sanitizePersonName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "_");
}

/**
 * Get the local photo path for a person, organized by first letter like Jellyfin:
 *   {metadataDir}/{FirstLetter}/{SanitizedName}/photo.jpg
 */
export function getPersonPhotoPath(metadataDir: string, name: string, ext: string = ".jpg"): string {
  const sanitized = sanitizePersonName(name);
  const firstLetter = sanitized.charAt(0).toUpperCase() || "_";
  return path.join(metadataDir, firstLetter, sanitized, `photo${ext}`);
}

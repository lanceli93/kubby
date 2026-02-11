import fs from "fs";
import path from "path";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w185";

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
  apiKey: string
): Promise<TmdbCredits> {
  const url = `${TMDB_BASE_URL}/movie/${tmdbId}/credits?api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TMDb API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function getImageUrl(profilePath: string): string {
  return `${TMDB_IMAGE_BASE}${profilePath}`;
}

export async function downloadImage(
  url: string,
  destPath: string
): Promise<boolean> {
  if (fs.existsSync(destPath)) return false;

  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });

  const res = await fetch(url);
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
export function getPersonPhotoPath(metadataDir: string, name: string): string {
  const sanitized = sanitizePersonName(name);
  const firstLetter = sanitized.charAt(0).toUpperCase() || "_";
  return path.join(metadataDir, firstLetter, sanitized, "photo.jpg");
}

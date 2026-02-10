import { XMLParser } from "fast-xml-parser";

export interface NfoData {
  title: string;
  originalTitle?: string;
  sortName?: string;
  overview?: string;
  tagline?: string;
  communityRating?: number;
  officialRating?: string;
  runtimeMinutes?: number;
  premiereDate?: string;
  year?: number;
  genres: string[];
  studios: string[];
  country?: string;
  actors: { name: string; role?: string; thumb?: string; order?: number }[];
  directors: string[];
  tmdbId?: string;
  imdbId?: string;
}

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseNfo(xml: string): NfoData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const parsed = parser.parse(xml);
  const movie = parsed.movie;

  if (!movie) {
    throw new Error("No <movie> element found in NFO");
  }

  const actors = ensureArray(movie.actor).map((a: Record<string, unknown>) => ({
    name: String(a.name || ""),
    role: a.role ? String(a.role) : undefined,
    thumb: a.thumb ? String(a.thumb) : undefined,
    order: a.order !== undefined ? Number(a.order) : undefined,
  }));

  // Extract unique IDs
  let tmdbId: string | undefined;
  let imdbId: string | undefined;
  const uniqueIds = ensureArray(movie.uniqueid);
  for (const uid of uniqueIds) {
    if (typeof uid === "object" && uid !== null) {
      const idObj = uid as Record<string, unknown>;
      if (idObj["@_type"] === "tmdb") tmdbId = String(idObj["#text"] || "");
      if (idObj["@_type"] === "imdb") imdbId = String(idObj["#text"] || "");
    }
  }

  return {
    title: String(movie.title || "Unknown"),
    originalTitle: movie.originaltitle ? String(movie.originaltitle) : undefined,
    sortName: movie.sorttitle ? String(movie.sorttitle) : undefined,
    overview: movie.plot ? String(movie.plot) : undefined,
    tagline: movie.tagline ? String(movie.tagline) : undefined,
    communityRating: movie.rating ? parseFloat(String(movie.rating)) : undefined,
    officialRating: movie.mpaa ? String(movie.mpaa) : undefined,
    runtimeMinutes: movie.runtime ? parseInt(String(movie.runtime), 10) : undefined,
    premiereDate: movie.premiered ? String(movie.premiered) : undefined,
    year: movie.year ? parseInt(String(movie.year), 10) : undefined,
    genres: ensureArray(movie.genre).map(String),
    studios: ensureArray(movie.studio).map(String),
    country: movie.country ? String(ensureArray(movie.country)[0]) : undefined,
    actors,
    directors: ensureArray(movie.director).map(String),
    tmdbId,
    imdbId,
  };
}

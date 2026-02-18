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
  videoCodec?: string;
  audioCodec?: string;
  videoWidth?: number;
  videoHeight?: number;
  audioChannels?: number;
  tags: string[];
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

  // Extract unique IDs: support both <uniqueid type="tmdb"> and <tmdbid> formats
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
  // Fallback: direct <tmdbid> / <imdbid> elements (Jellyfin format)
  if (!tmdbId && movie.tmdbid) tmdbId = String(movie.tmdbid);
  if (!imdbId && movie.imdbid) imdbId = String(movie.imdbid);

  // Extract fileinfo stream details
  const streamDetails = movie.fileinfo?.streamdetails;
  const videoStream = streamDetails?.video;
  const audioStream = streamDetails?.audio;
  // If there are multiple audio streams, take the first one
  const firstAudio = Array.isArray(audioStream) ? audioStream[0] : audioStream;

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
    videoCodec: videoStream?.codec ? String(videoStream.codec) : undefined,
    audioCodec: firstAudio?.codec ? String(firstAudio.codec) : undefined,
    videoWidth: videoStream?.width ? parseInt(String(videoStream.width), 10) : undefined,
    videoHeight: videoStream?.height ? parseInt(String(videoStream.height), 10) : undefined,
    audioChannels: firstAudio?.channels ? parseInt(String(firstAudio.channels), 10) : undefined,
    tags: ensureArray(movie.tag).map(String),
  };
}

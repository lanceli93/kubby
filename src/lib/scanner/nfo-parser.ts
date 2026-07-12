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
  actors: { name: string; role?: string; thumb?: string; order?: number; tmdbId?: number }[];
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
    tmdbId: a.tmdbid !== undefined ? Number(a.tmdbid) : undefined,
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

export interface TvShowNfoData {
  title: string;
  originalTitle?: string;
  sortName?: string;
  overview?: string; // from <plot>
  premiereDate?: string; // from <premiered>
  year?: number;
  status?: string;
  communityRating?: number; // from <rating>
  officialRating?: string; // from <mpaa>
  genres: string[];
  studios: string[];
  country?: string;
  tmdbId?: string;
  imdbId?: string;
  tvdbId?: string;
  actors: { name: string; role?: string; thumb?: string; order?: number; tmdbId?: number }[];
  tags: string[];
}

export function parseTvShowNfo(xml: string): TvShowNfoData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const parsed = parser.parse(xml);
  const tvshow = parsed.tvshow;

  if (!tvshow) {
    throw new Error("No <tvshow> element found in NFO");
  }

  const actors = ensureArray(tvshow.actor).map((a: Record<string, unknown>) => ({
    name: String(a.name || ""),
    role: a.role ? String(a.role) : undefined,
    thumb: a.thumb ? String(a.thumb) : undefined,
    order: a.order !== undefined ? Number(a.order) : undefined,
    tmdbId: a.tmdbid !== undefined ? Number(a.tmdbid) : undefined,
  }));

  // Extract unique IDs: support both <uniqueid type="tmdb"> and <tmdbid> formats
  let tmdbId: string | undefined;
  let imdbId: string | undefined;
  let tvdbId: string | undefined;
  const uniqueIds = ensureArray(tvshow.uniqueid);
  for (const uid of uniqueIds) {
    if (typeof uid === "object" && uid !== null) {
      const idObj = uid as Record<string, unknown>;
      if (idObj["@_type"] === "tmdb") tmdbId = String(idObj["#text"] || "");
      if (idObj["@_type"] === "imdb") imdbId = String(idObj["#text"] || "");
      if (idObj["@_type"] === "tvdb") tvdbId = String(idObj["#text"] || "");
    }
  }
  // Fallback: direct <tmdbid> / <imdbid> / <tvdbid> elements (Jellyfin format)
  if (!tmdbId && tvshow.tmdbid) tmdbId = String(tvshow.tmdbid);
  if (!imdbId && tvshow.imdbid) imdbId = String(tvshow.imdbid);
  if (!tvdbId && tvshow.tvdbid) tvdbId = String(tvshow.tvdbid);

  return {
    title: String(tvshow.title || "Unknown"),
    originalTitle: tvshow.originaltitle ? String(tvshow.originaltitle) : undefined,
    sortName: tvshow.sorttitle ? String(tvshow.sorttitle) : undefined,
    overview: tvshow.plot ? String(tvshow.plot) : undefined,
    premiereDate: tvshow.premiered ? String(tvshow.premiered) : undefined,
    year: tvshow.year ? parseInt(String(tvshow.year), 10) : undefined,
    status: tvshow.status ? String(tvshow.status) : undefined,
    communityRating: tvshow.rating ? parseFloat(String(tvshow.rating)) : undefined,
    officialRating: tvshow.mpaa ? String(tvshow.mpaa) : undefined,
    genres: ensureArray(tvshow.genre).map(String),
    studios: ensureArray(tvshow.studio).map(String),
    country: tvshow.country ? String(ensureArray(tvshow.country)[0]) : undefined,
    tmdbId,
    imdbId,
    tvdbId,
    actors,
    tags: ensureArray(tvshow.tag).map(String),
  };
}

export interface SeasonNfoData {
  seasonNumber?: number; // from <seasonnumber>
  title?: string;
  overview?: string; // from <plot>
  year?: number;
  tmdbId?: string;
}

export function parseSeasonNfo(xml: string): SeasonNfoData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const parsed = parser.parse(xml);
  const season = parsed.season;

  // season.nfo is optional; return an object with undefined fields if missing.
  if (!season) {
    return {};
  }

  // Extract unique IDs: support both <uniqueid type="tmdb"> and <tmdbid> formats
  let tmdbId: string | undefined;
  const uniqueIds = ensureArray(season.uniqueid);
  for (const uid of uniqueIds) {
    if (typeof uid === "object" && uid !== null) {
      const idObj = uid as Record<string, unknown>;
      if (idObj["@_type"] === "tmdb") tmdbId = String(idObj["#text"] || "");
    }
  }
  if (!tmdbId && season.tmdbid) tmdbId = String(season.tmdbid);

  return {
    seasonNumber:
      season.seasonnumber !== undefined ? parseInt(String(season.seasonnumber), 10) : undefined,
    title: season.title ? String(season.title) : undefined,
    overview: season.plot ? String(season.plot) : undefined,
    year: season.year ? parseInt(String(season.year), 10) : undefined,
    tmdbId,
  };
}

export interface EpisodeNfoData {
  title?: string;
  overview?: string; // from <plot>
  airDate?: string; // from <aired>
  season?: number; // from <season>
  episode?: number; // from <episode>
  communityRating?: number; // from <rating>
  runtimeMinutes?: number; // from <runtime>
  tmdbId?: string;
}

export function parseEpisodeNfo(xml: string): EpisodeNfoData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const parsed = parser.parse(xml);
  const episode = parsed.episodedetails;

  if (!episode) {
    throw new Error("No <episodedetails> element found in NFO");
  }

  // Extract unique IDs: support both <uniqueid type="tmdb"> and <tmdbid> formats
  let tmdbId: string | undefined;
  const uniqueIds = ensureArray(episode.uniqueid);
  for (const uid of uniqueIds) {
    if (typeof uid === "object" && uid !== null) {
      const idObj = uid as Record<string, unknown>;
      if (idObj["@_type"] === "tmdb") tmdbId = String(idObj["#text"] || "");
    }
  }
  if (!tmdbId && episode.tmdbid) tmdbId = String(episode.tmdbid);

  return {
    title: episode.title ? String(episode.title) : undefined,
    overview: episode.plot ? String(episode.plot) : undefined,
    airDate: episode.aired ? String(episode.aired) : undefined,
    season: episode.season !== undefined ? parseInt(String(episode.season), 10) : undefined,
    episode: episode.episode !== undefined ? parseInt(String(episode.episode), 10) : undefined,
    communityRating: episode.rating ? parseFloat(String(episode.rating)) : undefined,
    runtimeMinutes: episode.runtime ? parseInt(String(episode.runtime), 10) : undefined,
    tmdbId,
  };
}

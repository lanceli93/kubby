// Shared contract between the recommend engine/API (server) and the recommend
// page + scenes (client). Keep this file free of server-only imports.

export type RecommendMix = "movies" | "mixed" | "actors";

export type RecommendPreset =
  | "blind" // 盲盒 — no filters, pure weighted random
  | "hiddenGems" // 冷门佳作 — high community rating, never played
  | "rewatch" // 重温最爱 — favorited / highly rated by me, not played recently
  | "quick" // 短平快 — runtime ≤ 100 min
  | "actorSpotlight"; // 演员专场 — actors only

export type RecommendTheme = "vortex" | "tabletop";

export interface RecommendFilters {
  /** any-of match against movies.genres */
  genres?: string[];
  /** any-of match against movies.tags */
  tags?: string[];
  /** communityRating >= minRating */
  minRating?: number;
  yearFrom?: number;
  yearTo?: number;
  /** runtimeMinutes <= maxRuntime (movies with unknown runtime are kept) */
  maxRuntime?: number;
  /** default "unwatched" */
  watched?: "unwatched" | "any" | "watched";
  /** restrict to one movie library (must be type "movie") */
  libraryId?: string;
  preset?: RecommendPreset;
  /** default "mixed" */
  mix?: RecommendMix;
}

export type RecommendItemType = "movie" | "person";

export interface RecommendItemRef {
  type: RecommendItemType;
  id: string;
}

/** Lightweight item for the visual pile (the candidate pool). */
export interface PoolItem extends RecommendItemRef {
  title: string;
  /** cache-stamped path for resolveImageSrc() — poster for movies, photo for people */
  image: string | null;
  blur: string | null;
}

export interface PoolResponse {
  movieCount: number;
  actorCount: number;
  /** sample of the pool, capped (≤ 64); actors only when mix !== "movies". Random,
   *  or — with the request's optional `seed` query param — deterministic per seed. */
  items: PoolItem[];
}

/**
 * Machine-readable "why" — the client localizes these via the `recommend`
 * i18n namespace. Never send display strings from the server.
 */
export type RecommendReason =
  | { code: "highRating"; rating: number }
  | { code: "unwatched" }
  | { code: "favGenre"; genre: string; avg: number | null } // user's avg personal rating in that genre
  | { code: "favActor"; name: string } // a cast member the user favorited
  | { code: "ratedActor"; name: string; rating: number } // a cast member the user rated highly
  | { code: "favorite" } // the movie itself is favorited
  | { code: "rewatch"; lastPlayedAt: string | null }
  | { code: "short"; runtime: number }
  | { code: "newlyAdded" }
  | { code: "matchesTag"; tag: string }
  | { code: "actorMatching"; count: number } // actor: N films match the filters
  | { code: "actorUnwatched"; count: number }; // actor: N matching films not yet watched

export interface MovieCardData {
  type: "movie";
  id: string;
  title: string;
  year: number | null;
  rating: number | null; // communityRating
  personalRating: number | null;
  runtimeMinutes: number | null;
  genres: string[];
  posterPath: string | null; // stamped
  posterBlur: string | null;
  fanartPath: string | null; // stamped
  isPlayed: boolean;
  isFavorite: boolean;
  reasons: RecommendReason[]; // 1–3, strongest first
}

export interface ActorCardData {
  type: "person";
  id: string;
  name: string;
  photoPath: string | null; // stamped
  photoBlur: string | null;
  /** fanart of the actor's top matching film, for the ambient backdrop */
  fanartPath: string | null;
  personalRating: number | null;
  isFavorite: boolean;
  matchingCount: number;
  unwatchedCount: number;
  /** 2–3 of the actor's matching films, never duplicating movies in the same hand */
  films: MovieCardData[];
  reasons: RecommendReason[];
}

export type RecommendCard = MovieCardData | ActorCardData;

export interface DrawRequest {
  filters: RecommendFilters;
  /** how many NEW movie cards / actor cards to return (client subtracts locked slots) */
  movies: number;
  actors: number;
  /** locked cards (and anything else) to exclude from this draw */
  exclude?: RecommendItemRef[];
}

export interface DrawResponse {
  /** movies first then actors is NOT guaranteed — client places by type */
  cards: RecommendCard[];
  /** true when the pool was too small and 30-day de-dup had to be relaxed */
  repeatsAllowed: boolean;
}

export interface HistoryRequest extends RecommendItemRef {
  action: "dismissed";
}

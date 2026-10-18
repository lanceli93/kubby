// Shared contract between the recommend engine/API (server) and the recommend
// page + scenes (client). Keep this file free of server-only imports.

/** "clips" = video bookmarks only (片段). "mixed" may also deal ONE clip as a
 *  wildcard in place of a movie (see DrawRequest.clipWildcard). */
export type RecommendMix = "movies" | "mixed" | "actors" | "clips";

export type RecommendPreset =
  | "blind" // 盲盒 — no filters, pure weighted random
  | "hiddenGems" // 冷门佳作 — high community rating, never played
  | "rewatch" // 重温最爱 — favorited / highly rated by me, not played recently
  | "quick" // 短平快 — runtime ≤ 100 min
  | "actorSpotlight" // 演员专场 — actors only
  | "clipRewind"; // 片段重温 — my video bookmarks only

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

/** "bookmark" = a movie video bookmark (movie_bookmarks.id) — a "clip" card. */
export type RecommendItemType = "movie" | "person" | "bookmark";

export interface RecommendItemRef {
  type: RecommendItemType;
  id: string;
}

/** Lightweight item for the visual pile (the candidate pool). */
export interface PoolItem extends RecommendItemRef {
  title: string;
  /** cache-stamped path for resolveImageSrc() — poster for movies, photo for
   *  people, the PARENT movie's poster for bookmarks */
  image: string | null;
  blur: string | null;
  /** bookmarks only: the bookmark frame (stamped) + its width/height ratio */
  still?: string | null;
  stillAspect?: number | null;
}

export interface PoolResponse {
  movieCount: number;
  actorCount: number;
  /** eligible video bookmarks (clips) for these filters; 0 when mix is movies/actors */
  clipCount: number;
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
  | { code: "actorUnwatched"; count: number } // actor: N matching films not yet watched
  | { code: "bookmarkMoment"; timestampSeconds: number; createdAt: string } // clip: "your bookmark at 01:23:45 · 3 months ago"
  | { code: "bookmarkTag"; tag: string }; // clip: a filter tag matched the bookmark's own tags

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

/** A video bookmark of a movie ("clip"). Click = play the movie from the mark. */
export interface ClipCardData {
  type: "bookmark";
  id: string; // movie_bookmarks.id
  movieId: string;
  movieTitle: string;
  year: number | null;
  posterPath: string | null; // stamped — the parent poster (the "envelope")
  posterBlur: string | null;
  fanartPath: string | null; // stamped — for the ambient backdrop
  stillPath: string | null; // stamped — the bookmark frame (any aspect)
  stillAspect: number | null; // width / height (e.g. 1.78, 2.39, 0.56; 2 for 360° frames)
  timestampSeconds: number;
  discNumber: number; // 1-based
  iconType: string; // built-in icon id or a custom icon id (see lib/bookmark-icons)
  tags: string[];
  note: string | null;
  /** 360° bookmarks: the saved camera; null otherwise */
  viewState: { lon: number; lat: number; fov: number } | null;
  createdAt: string;
  personalRating: number | null; // of the parent movie
  reasons: RecommendReason[]; // bookmarkMoment first
}

export type RecommendCard = MovieCardData | ActorCardData | ClipCardData;

export interface DrawRequest {
  filters: RecommendFilters;
  /** how many NEW movie cards / actor cards to return (client subtracts locked slots) */
  movies: number;
  actors: number;
  /** how many NEW clip cards (default 0) */
  clips?: number;
  /** mixed hands: the server MAY return one clip in place of one of the `movies`
   *  (≈30% of draws, only when ≥ 3 eligible clips exist). Clips then fill movie slots. */
  clipWildcard?: boolean;
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

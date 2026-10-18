import type { RecommendFilters, RecommendPreset } from "./types";

// Client-safe preset definitions. Clicking a preset in the UI replaces the
// filter bar with these filters (the user can tweak them afterwards); the
// engine additionally applies the preset's scoring bias (see engine.ts).
export const RECOMMEND_PRESETS: Record<RecommendPreset, RecommendFilters> = {
  blind: { preset: "blind", watched: "unwatched", mix: "mixed" },
  hiddenGems: { preset: "hiddenGems", watched: "unwatched", minRating: 7.5, mix: "movies" },
  rewatch: { preset: "rewatch", watched: "watched", mix: "movies" },
  quick: { preset: "quick", watched: "unwatched", maxRuntime: 100, mix: "movies" },
  actorSpotlight: { preset: "actorSpotlight", watched: "unwatched", mix: "actors" },
  // clips ignore the watched filter (a bookmark implies the movie was played)
  clipRewind: { preset: "clipRewind", watched: "any", mix: "clips" },
};

export const RECOMMEND_PRESET_ORDER: RecommendPreset[] = [
  "blind",
  "hiddenGems",
  "rewatch",
  "quick",
  "actorSpotlight",
  "clipRewind",
];

export const DEFAULT_FILTERS: RecommendFilters = { watched: "unwatched", mix: "mixed" };

export const HAND_SIZE = 5;

/** How many movie / actor / clip cards a full hand of HAND_SIZE holds for a
 *  mix. A mixed hand's movie slots may also hold the one wildcard clip. */
export function handComposition(mix: RecommendFilters["mix"] = "mixed"): {
  movies: number;
  actors: number;
  clips: number;
} {
  if (mix === "movies") return { movies: HAND_SIZE, actors: 0, clips: 0 };
  if (mix === "actors") return { movies: 0, actors: HAND_SIZE, clips: 0 };
  if (mix === "clips") return { movies: 0, actors: 0, clips: HAND_SIZE };
  return { movies: HAND_SIZE - 1, actors: 1, clips: 0 };
}

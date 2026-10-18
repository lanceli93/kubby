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
};

export const RECOMMEND_PRESET_ORDER: RecommendPreset[] = [
  "blind",
  "hiddenGems",
  "rewatch",
  "quick",
  "actorSpotlight",
];

export const DEFAULT_FILTERS: RecommendFilters = { watched: "unwatched", mix: "mixed" };

export const HAND_SIZE = 5;

/** How many movie / actor cards a full hand of HAND_SIZE holds for a mix. */
export function handComposition(mix: RecommendFilters["mix"] = "mixed"): {
  movies: number;
  actors: number;
} {
  if (mix === "movies") return { movies: HAND_SIZE, actors: 0 };
  if (mix === "actors") return { movies: 0, actors: HAND_SIZE };
  return { movies: HAND_SIZE - 1, actors: 1 };
}

import { useQuery } from "@tanstack/react-query";

export interface UserPreferences {
  movieRatingDimensions: string[];
  personRatingDimensions: string[];
  showMovieRatingBadge: boolean;
  showPersonTierBadge: boolean;
  showPersonRatingBadge: boolean;
  showResolutionBadge: boolean;
  externalPlayerEnabled: boolean;
  externalPlayerName: string | null;
  externalPlayerPath: string | null;
  externalPlayerMode: string | null; // "local" | "stream"
  disabledBookmarkIcons: string[];
  serverPlatform: string; // "darwin" | "win32" | "linux"
}

export function useUserPreferences() {
  return useQuery<UserPreferences>({
    queryKey: ["userPreferences"],
    queryFn: () =>
      fetch("/api/settings/personal-metadata").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

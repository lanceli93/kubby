import { useQuery } from "@tanstack/react-query";

export interface UserPreferences {
  movieRatingDimensions: string[];
  personRatingDimensions: string[];
  showMovieRatingBadge: boolean;
  showPersonTierBadge: boolean;
  showResolutionBadge: boolean;
}

export function useUserPreferences() {
  return useQuery<UserPreferences>({
    queryKey: ["userPreferences"],
    queryFn: () =>
      fetch("/api/settings/personal-metadata").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
}

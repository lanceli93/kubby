"use client";

import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { MovieCard } from "@/components/movie/movie-card";
import { PersonCard } from "@/components/people/person-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

interface FavMovie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  posterBlur?: string | null;
  communityRating?: number | null;
  personalRating?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  isWatched?: boolean;
}

interface FavPerson {
  id: string;
  name: string;
  photoPath?: string | null;
  photoBlur?: string | null;
  personalRating?: number | null;
  movieCount: number;
}

interface Paginated<T> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// Same responsive poster grid the library / actors browsers use, so the
// favorites view reads identically to drilling into a media library.
const GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,180px)] md:gap-x-4 md:gap-y-6 justify-center";

/**
 * Favorites in the same full-grid form as a media library, split by a
 * Movies / Actors sub-tab. Both panels are complete responsive grids with
 * infinite scroll (no more single-row previews). Shared by the movies-page
 * favorites tab and the home-page favorites tab.
 */
export function FavoritesBrowser({ libraryId = "" }: { libraryId?: string }) {
  const t = useTranslations("movies");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"movies" | "actors">("movies");

  // ── Favorite movies ──────────────────────────────────────────
  const moviesQuery = useInfiniteQuery<Paginated<FavMovie>>({
    queryKey: ["movies", "favorites", libraryId],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("filter", "favorites");
      if (libraryId) params.set("libraryId", libraryId);
      params.set("offset", String(pageParam));
      return fetch(`/api/movies?${params}`).then((r) => r.json());
    },
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.hasMore ? last.offset + last.limit : undefined,
  });
  const favMovies = moviesQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const movieCount = moviesQuery.data?.pages[0]?.totalCount ?? favMovies.length;
  const { sentinelRef: moviesSentinel } = useInfiniteScroll({
    hasNextPage: moviesQuery.hasNextPage,
    isFetchingNextPage: moviesQuery.isFetchingNextPage,
    fetchNextPage: moviesQuery.fetchNextPage,
  });

  // ── Favorite actors ──────────────────────────────────────────
  const actorsQuery = useInfiniteQuery<Paginated<FavPerson>>({
    queryKey: ["people", "favorites-grid"],
    queryFn: ({ pageParam }) =>
      fetch(`/api/people?filter=favorites&offset=${pageParam}`).then((r) =>
        r.json(),
      ),
    initialPageParam: 0,
    getNextPageParam: (last) =>
      last.hasMore ? last.offset + last.limit : undefined,
  });
  const favActors = actorsQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const actorCount = actorsQuery.data?.pages[0]?.totalCount ?? favActors.length;
  const { sentinelRef: actorsSentinel } = useInfiniteScroll({
    hasNextPage: actorsQuery.hasNextPage,
    isFetchingNextPage: actorsQuery.isFetchingNextPage,
    fetchNextPage: actorsQuery.fetchNextPage,
  });

  // ── Mutations ─────────────────────────────────────────────────
  const toggleMovieFavorite = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/movies/${id}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: false }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movies"] }),
  });
  const toggleMovieWatched = useMutation({
    mutationFn: ({ id, current }: { id: string; current: boolean }) =>
      fetch(`/api/movies/${id}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPlayed: !current }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movies"] }),
  });
  const deleteMovie = useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles?: boolean }) =>
      fetch(`/api/movies/${id}${deleteFiles ? "?deleteFiles=true" : ""}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movies"] }),
  });
  const togglePersonFavorite = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/people/${id}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: false }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["people"] }),
  });
  const deletePerson = useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles?: boolean }) =>
      fetch(`/api/people/${id}${deleteFiles ? "?deleteFiles=true" : ""}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["movies"] });
    },
  });

  const loading = moviesQuery.isLoading || actorsQuery.isLoading;
  if (!loading && movieCount === 0 && actorCount === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t("noFavorites")}
      </div>
    );
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "movies" | "actors")}
      className="animate-fade-in-up"
    >
      <div className="flex justify-center pt-6 pb-4">
        <TabsList>
          <TabsTrigger value="movies" className="cursor-pointer px-4">
            {t("favoriteMovies")}
            {movieCount > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                {movieCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="actors" className="cursor-pointer px-4">
            {t("favoriteActors")}
            {actorCount > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                {actorCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="movies">
        {favMovies.length > 0 ? (
          <div className={GRID_CLASS}>
            {favMovies.map((movie, index) => (
              <MovieCard
                key={movie.id}
                id={movie.id}
                title={movie.title}
                year={movie.year}
                posterPath={movie.posterPath}
                posterBlur={movie.posterBlur}
                rating={movie.communityRating}
                personalRating={movie.personalRating}
                videoWidth={movie.videoWidth}
                videoHeight={movie.videoHeight}
                isFavorite
                isWatched={movie.isWatched}
                responsive
                priority={index < 10}
                onToggleFavorite={() => toggleMovieFavorite.mutate(movie.id)}
                onToggleWatched={() =>
                  toggleMovieWatched.mutate({
                    id: movie.id,
                    current: !!movie.isWatched,
                  })
                }
                onDelete={(deleteFiles) =>
                  deleteMovie.mutate({ id: movie.id, deleteFiles })
                }
              />
            ))}
          </div>
        ) : (
          !moviesQuery.isLoading && (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              {t("noFavorites")}
            </div>
          )
        )}
        <div ref={moviesSentinel} className="h-1" />
        {moviesQuery.isFetchingNextPage && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </TabsContent>

      <TabsContent value="actors">
        {favActors.length > 0 ? (
          <div className={GRID_CLASS}>
            {favActors.map((person) => (
              <PersonCard
                key={person.id}
                id={person.id}
                name={person.name}
                role={`${person.movieCount} ${person.movieCount === 1 ? "movie" : "movies"}`}
                photoPath={person.photoPath}
                photoBlur={person.photoBlur}
                personalRating={person.personalRating}
                isFavorite
                size="movie"
                onToggleFavorite={() => togglePersonFavorite.mutate(person.id)}
                onDelete={(deleteFiles) =>
                  deletePerson.mutate({ id: person.id, deleteFiles })
                }
              />
            ))}
          </div>
        ) : (
          !actorsQuery.isLoading && (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              {t("noFavoriteActors")}
            </div>
          )
        )}
        <div ref={actorsSentinel} className="h-1" />
        {actorsQuery.isFetchingNextPage && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

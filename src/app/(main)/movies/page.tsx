"use client";

import { Suspense, useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MovieCard } from "@/components/movie/movie-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ArrowDownAZ,
  CalendarPlus,
  Calendar,
  Star,
  Timer,
} from "lucide-react";

interface Movie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  communityRating?: number | null;
  isFavorite?: boolean;
  isWatched?: boolean;
  genres?: string[];
}

export default function MovieBrowsePage() {
  return (
    <Suspense>
      <MovieBrowseContent />
    </Suspense>
  );
}

function useMovieMutations() {
  const queryClient = useQueryClient();

  const toggleFavorite = useMutation({
    mutationFn: ({ id, current }: { id: string; current: boolean }) =>
      fetch(`/api/movies/${id}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !current }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movies"] });
    },
  });

  const toggleWatched = useMutation({
    mutationFn: ({ id, current }: { id: string; current: boolean }) =>
      fetch(`/api/movies/${id}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPlayed: !current }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movies"] });
    },
  });

  const deleteMovie = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/movies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movies"] });
    },
  });

  return {
    handleToggleFavorite: (id: string, current: boolean) =>
      toggleFavorite.mutate({ id, current }),
    handleToggleWatched: (id: string, current: boolean) =>
      toggleWatched.mutate({ id, current }),
    handleDeleteMovie: (id: string) => deleteMovie.mutate(id),
  };
}

function MovieBrowseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const libraryId = searchParams.get("libraryId") || "";
  const t = useTranslations("movies");

  // If no libraryId, redirect to home
  if (!libraryId) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4 text-center px-12">
        <p className="text-lg text-muted-foreground">
          {t("selectLibrary")}
        </p>
        <button
          onClick={() => router.push("/")}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("allMovies")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs defaultValue="movies">
        <div className="flex justify-center border-b border-white/[0.06] bg-[var(--header)]">
          <TabsList variant="line">
            <TabsTrigger value="movies">{t("movies")}</TabsTrigger>
            <TabsTrigger value="favorites">{t("favorites")}</TabsTrigger>
            <TabsTrigger value="genres">{t("genres")}</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto px-12 py-6">
          <TabsContent value="movies">
            <MoviesTabContent libraryId={libraryId} />
          </TabsContent>

          <TabsContent value="favorites">
            <FavoritesTabContent libraryId={libraryId} />
          </TabsContent>

          <TabsContent value="genres">
            <GenresTabContent libraryId={libraryId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function MoviesTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("movies");
  const [sort, setSort] = useState("dateAdded");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const { handleToggleFavorite, handleToggleWatched, handleDeleteMovie } =
    useMovieMutations();

  const sortOptions = [
    { value: "title", label: t("titleAZ"), icon: ArrowDownAZ },
    { value: "dateAdded", label: t("dateAdded"), icon: CalendarPlus },
    { value: "releaseDate", label: t("releaseDate"), icon: Calendar },
    { value: "rating", label: t("rating"), icon: Star },
    { value: "runtime", label: t("runtime"), icon: Timer },
  ];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: movies = [] } = useQuery<Movie[]>({
    queryKey: ["movies", { libraryId, sort }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("libraryId", libraryId);
      params.set("sort", sort);
      return fetch(`/api/movies?${params}`).then((r) => r.json());
    },
  });

  const currentSortLabel =
    sortOptions.find((o) => o.value === sort)?.label || t("dateAdded");

  return (
    <div className="pt-4">
      {/* Sort Toolbar */}
      <div className="mb-4 flex items-center justify-end">
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-3 py-1.5 text-[13px] text-muted-foreground hover:border-white/20"
          >
            {currentSortLabel}
            <ChevronDown className="h-3.5 w-3.5 text-[#666680]" />
          </button>

          {showSortDropdown && (
            <div className="absolute right-0 top-full z-50 mt-1 w-[220px] rounded-[10px] border border-white/[0.08] bg-card py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.63)]">
              {sortOptions.map((option) => {
                const Icon = option.icon;
                const isActive = sort === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSort(option.value);
                      setShowSortDropdown(false);
                    }}
                    className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                      isActive
                        ? "bg-primary/[0.08] text-foreground"
                        : "text-[#d0d0e0] hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${
                        isActive ? "text-primary" : "text-[#666680]"
                      }`}
                    />
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Movie Grid */}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: "repeat(auto-fill, 180px)",
          justifyContent: "center",
        }}
      >
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            id={movie.id}
            title={movie.title}
            year={movie.year}
            posterPath={movie.posterPath}
            rating={movie.communityRating}
            isFavorite={movie.isFavorite}
            isWatched={movie.isWatched}
            onToggleFavorite={() =>
              handleToggleFavorite(movie.id, !!movie.isFavorite)
            }
            onToggleWatched={() =>
              handleToggleWatched(movie.id, !!movie.isWatched)
            }
            onDelete={() => handleDeleteMovie(movie.id)}
          />
        ))}
      </div>

      {movies.length === 0 && (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          {t("noMovies")}
        </div>
      )}
    </div>
  );
}

function FavoritesTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("movies");
  const { handleToggleFavorite, handleToggleWatched, handleDeleteMovie } =
    useMovieMutations();

  const { data: favorites = [] } = useQuery<Movie[]>({
    queryKey: ["movies", "favorites", libraryId],
    queryFn: () =>
      fetch(
        `/api/movies?filter=favorites&libraryId=${libraryId}&limit=500`
      ).then((r) => r.json()),
  });

  return (
    <div className="pt-4">
      {favorites.length > 0 ? (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, 180px)",
            justifyContent: "center",
          }}
        >
          {favorites.map((movie) => (
            <MovieCard
              key={movie.id}
              id={movie.id}
              title={movie.title}
              year={movie.year}
              posterPath={movie.posterPath}
              rating={movie.communityRating}
              isFavorite
              isWatched={movie.isWatched}
              onToggleFavorite={() =>
                handleToggleFavorite(movie.id, true)
              }
              onToggleWatched={() =>
                handleToggleWatched(movie.id, !!movie.isWatched)
              }
              onDelete={() => handleDeleteMovie(movie.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          {t("noFavorites")}
        </div>
      )}
    </div>
  );
}

function GenresTabContent({ libraryId }: { libraryId: string }) {
  const { data: allMovies = [] } = useQuery<Movie[]>({
    queryKey: ["movies", "genres-view", libraryId],
    queryFn: () =>
      fetch(
        `/api/movies?libraryId=${libraryId}&includeGenres=true&limit=5000`
      ).then((r) => r.json()),
  });

  const { handleToggleFavorite, handleToggleWatched, handleDeleteMovie } =
    useMovieMutations();

  const genreGroups = useMemo(() => {
    const map = new Map<string, Movie[]>();
    for (const movie of allMovies) {
      if (movie.genres && Array.isArray(movie.genres)) {
        for (const genre of movie.genres) {
          if (!map.has(genre)) {
            map.set(genre, []);
          }
          map.get(genre)!.push(movie);
        }
      }
    }
    // Sort genres alphabetically
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allMovies]);

  if (genreGroups.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center pt-4 text-muted-foreground">
        No genres found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pt-4">
      {genreGroups.map(([genre, movies]) => (
        <section key={genre} className="flex flex-col gap-3">
          <ScrollRow title={genre}>
            {movies.map((movie) => (
              <MovieCard
                key={movie.id}
                id={movie.id}
                title={movie.title}
                year={movie.year}
                posterPath={movie.posterPath}
                rating={movie.communityRating}
                isFavorite={movie.isFavorite}
                isWatched={movie.isWatched}
                onToggleFavorite={() =>
                  handleToggleFavorite(movie.id, !!movie.isFavorite)
                }
                onToggleWatched={() =>
                  handleToggleWatched(movie.id, !!movie.isWatched)
                }
                onDelete={() => handleDeleteMovie(movie.id)}
              />
            ))}
          </ScrollRow>
        </section>
      ))}
    </div>
  );
}

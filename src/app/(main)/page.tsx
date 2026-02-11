"use client";

import { useQuery } from "@tanstack/react-query";
import { MovieCard } from "@/components/movie/movie-card";
import { LibraryCard } from "@/components/library/library-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useTranslations } from "next-intl";

interface Movie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  communityRating?: number | null;
  isFavorite?: boolean;
  progress?: number;
}

interface Library {
  id: string;
  name: string;
  type: string;
  movieCount?: number;
}

function MovieRow({
  title,
  movies,
  showProgress,
}: {
  title: string;
  movies: Movie[];
  showProgress?: boolean;
}) {
  if (movies.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <ScrollRow>
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            id={movie.id}
            title={movie.title}
            year={movie.year}
            posterPath={movie.posterPath}
            rating={movie.communityRating}
            isFavorite={movie.isFavorite}
            progress={movie.progress}
            showProgress={showProgress}
          />
        ))}
      </ScrollRow>
    </section>
  );
}

export default function HomePage() {
  const t = useTranslations("home");

  const { data: libraries = [] } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
  });

  const { data: continueWatching = [] } = useQuery<Movie[]>({
    queryKey: ["movies", "continue-watching"],
    queryFn: () =>
      fetch("/api/movies?filter=continue-watching").then((r) => r.json()),
  });

  const { data: recentlyAdded = [] } = useQuery<Movie[]>({
    queryKey: ["movies", "recently-added"],
    queryFn: () =>
      fetch("/api/movies?sort=dateAdded&limit=12").then((r) => r.json()),
  });

  const { data: favorites = [] } = useQuery<Movie[]>({
    queryKey: ["movies", "favorites"],
    queryFn: () =>
      fetch("/api/movies?filter=favorites").then((r) => r.json()),
  });

  return (
    <div className="flex flex-col gap-10 px-12 py-8">
      {/* Media Libraries */}
      {libraries.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-foreground">
            {t("mediaLibraries")}
          </h2>
          <ScrollRow>
            {libraries.map((lib) => (
              <LibraryCard
                key={lib.id}
                id={lib.id}
                name={lib.name}
                type={lib.type}
                movieCount={lib.movieCount}
              />
            ))}
          </ScrollRow>
        </section>
      )}

      {/* Continue Watching */}
      <MovieRow
        title={t("continueWatching")}
        movies={continueWatching}
        showProgress
      />

      {/* Recently Added */}
      <MovieRow title={t("recentlyAdded")} movies={recentlyAdded} />

      {/* Favorites */}
      <MovieRow title={t("favorites")} movies={favorites} />

      {/* Empty state */}
      {libraries.length === 0 &&
        recentlyAdded.length === 0 && (
          <div className="flex h-96 flex-col items-center justify-center gap-4 text-center">
            <p className="text-lg text-muted-foreground">
              {t("emptyState")}
            </p>
          </div>
        )}
    </div>
  );
}

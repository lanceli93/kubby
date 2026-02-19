"use client";

import { useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MovieCard } from "@/components/movie/movie-card";
import { LibraryCard } from "@/components/library/library-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";

interface Movie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  communityRating?: number | null;
  personalRating?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  isFavorite?: boolean;
  isWatched?: boolean;
  progress?: number;
}

interface Library {
  id: string;
  name: string;
  type: string;
  movieCount?: number;
  coverImage?: string | null;
  hasCustomCover?: boolean;
}

function MovieRow({
  title,
  movies,
  showProgress,
  onToggleFavorite,
  onToggleWatched,
  onDelete,
}: {
  title: string;
  movies: Movie[];
  showProgress?: boolean;
  onToggleFavorite: (id: string, current: boolean) => void;
  onToggleWatched: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (movies.length === 0) return null;

  return (
    <ScrollRow title={title}>
      {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            id={movie.id}
            title={movie.title}
            year={movie.year}
            posterPath={movie.posterPath}
            rating={movie.communityRating}
            personalRating={movie.personalRating}
            videoWidth={movie.videoWidth}
            videoHeight={movie.videoHeight}
            isFavorite={movie.isFavorite}
            isWatched={movie.isWatched}
            progress={movie.progress}
            showProgress={showProgress}
            onToggleFavorite={() =>
              onToggleFavorite(movie.id, !!movie.isFavorite)
            }
            onToggleWatched={() =>
              onToggleWatched(movie.id, !!movie.isWatched)
            }
            onDelete={() => onDelete(movie.id)}
          />
        ))}
      </ScrollRow>
  );
}

export default function HomePage() {
  const t = useTranslations("home");
  const queryClient = useQueryClient();

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
      fetch("/api/movies?filter=favorites&limit=500").then((r) => r.json()),
  });

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

  const scanLibrary = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/libraries/${id}/scan`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      queryClient.invalidateQueries({ queryKey: ["movies"] });
    },
  });

  const deleteLibrary = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/libraries/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      queryClient.invalidateQueries({ queryKey: ["movies"] });
    },
  });

  const uploadCover = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetch(`/api/libraries/${id}/cover`, {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingLibraryIdRef = useRef<string | null>(null);

  const handleEditImage = useCallback((libraryId: string) => {
    pendingLibraryIdRef.current = libraryId;
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const id = pendingLibraryIdRef.current;
      if (file && id) {
        uploadCover.mutate({ id, file });
      }
      pendingLibraryIdRef.current = null;
      e.target.value = "";
    },
    [uploadCover]
  );

  const removeCover = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/libraries/${id}/cover`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
    },
  });

  const handleToggleFavorite = (id: string, current: boolean) => {
    toggleFavorite.mutate({ id, current });
  };

  const handleToggleWatched = (id: string, current: boolean) => {
    toggleWatched.mutate({ id, current });
  };

  const handleDeleteMovie = (id: string) => {
    deleteMovie.mutate(id);
  };

  return (
    <div className="flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <Tabs defaultValue="home">
        <div className="flex justify-center border-b border-white/[0.06] bg-[var(--header)]">
          <TabsList variant="line">
            <TabsTrigger value="home">{t("homeTab")}</TabsTrigger>
            <TabsTrigger value="favorites">{t("favoritesTab")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="home">
          <div className="flex flex-col gap-10 px-12 py-8">
            {/* Media Libraries */}
            {libraries.length > 0 && (
              <ScrollRow title={t("mediaLibraries")}>
                {libraries.map((lib) => (
                  <LibraryCard
                    key={lib.id}
                    id={lib.id}
                    name={lib.name}
                    type={lib.type}
                    movieCount={lib.movieCount}
                    coverImage={lib.coverImage}
                    hasCustomCover={lib.hasCustomCover}
                    onScan={async () => {
                      const res = await fetch(`/api/libraries/${lib.id}/scan`, { method: "POST" });
                      const data = await res.json();
                      queryClient.invalidateQueries({ queryKey: ["libraries"] });
                      queryClient.invalidateQueries({ queryKey: ["movies"] });
                      return data;
                    }}
                    onDelete={() => deleteLibrary.mutate(lib.id)}
                    onEditImage={() => handleEditImage(lib.id)}
                    onRemoveImage={() => removeCover.mutate(lib.id)}
                  />
                ))}
              </ScrollRow>
            )}

            {/* Continue Watching */}
            <MovieRow
              title={t("continueWatching")}
              movies={continueWatching}
              showProgress
              onToggleFavorite={handleToggleFavorite}
              onToggleWatched={handleToggleWatched}
              onDelete={handleDeleteMovie}
            />

            {/* Recently Added */}
            <MovieRow
              title={t("recentlyAdded")}
              movies={recentlyAdded}
              onToggleFavorite={handleToggleFavorite}
              onToggleWatched={handleToggleWatched}
              onDelete={handleDeleteMovie}
            />

            {/* Favorites */}
            <MovieRow
              title={t("favorites")}
              movies={favorites}
              onToggleFavorite={handleToggleFavorite}
              onToggleWatched={handleToggleWatched}
              onDelete={handleDeleteMovie}
            />

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
        </TabsContent>

        <TabsContent value="favorites">
          <div className="px-12 py-8">
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
                    personalRating={movie.personalRating}
                    videoWidth={movie.videoWidth}
                    videoHeight={movie.videoHeight}
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
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                {t("noFavorites")}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

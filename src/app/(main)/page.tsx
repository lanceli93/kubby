"use client";

import { useRef, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MovieCard } from "@/components/movie/movie-card";
import { FavoritesBrowser } from "@/components/movie/favorites-browser";
import { ContinueWatchingCard } from "@/components/movie/continue-watching-card";
import { LibraryCard } from "@/components/library/library-card";
import { AddLibraryCard } from "@/components/library/add-library-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { HomeHero } from "@/components/home/home-hero";
import { PeopleHero, type PeopleWallEntry } from "@/components/home/people-hero";
import {
  AmbientProvider,
  AmbientField,
  AmbientHoverZone,
} from "@/components/home/ambient-field";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { DEFAULT_HERO_MOSAIC_CONFIG } from "@/lib/hero-mosaic-config";
import { DEFAULT_PEOPLE_MOSAIC_CONFIG } from "@/lib/people-mosaic-config";
import { useTranslations } from "next-intl";

interface Movie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  posterBlur?: string | null;
  fanartPath?: string | null;
  overview?: string | null;
  communityRating?: number | null;
  personalRating?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  isFavorite?: boolean;
  isWatched?: boolean;
  progress?: number;
  discLabel?: string | null;
  currentDisc?: number;
  discCount?: number;
  runtimeSeconds?: number | null;
  runtimeMinutes?: number | null;
}

interface Library {
  id: string;
  name: string;
  type: string;
  folderPaths?: string[];
  scraperEnabled?: boolean;
  jellyfinCompat?: boolean;
  metadataLanguage?: string | null;
  movieCount?: number;
  coverImage?: string | null;
  hasCustomCover?: boolean;
  lastScannedAt?: string | null;
}

function MovieRow({
  title,
  movies,
  showProgress,
  prioritizeFirst,
  onToggleFavorite,
  onToggleWatched,
  onDelete,
}: {
  title: string;
  movies: Movie[];
  showProgress?: boolean;
  // LCP hint — only the row rendered immediately below the hero (above the
  // fold) should opt in; rows further down the page (e.g. Favorites) stay lazy.
  prioritizeFirst?: boolean;
  onToggleFavorite: (id: string, current: boolean) => void;
  onToggleWatched: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
}) {
  if (movies.length === 0) return null;

  return (
    <ScrollRow title={title}>
      {movies.map((movie, index) => {
          const displayTitle = movie.discLabel
            ? `${movie.discLabel} · ${movie.title}`
            : movie.title;
          return (
          <AmbientHoverZone
            key={movie.discLabel ? `${movie.id}-disc${movie.currentDisc}` : movie.id}
            posterBlur={movie.posterBlur}
            className="flex-shrink-0"
          >
          <MovieCard
            id={movie.id}
            title={displayTitle}
            year={movie.year}
            posterPath={movie.posterPath}
            posterBlur={movie.posterBlur}
            rating={movie.communityRating}
            personalRating={movie.personalRating}
            videoWidth={movie.videoWidth}
            videoHeight={movie.videoHeight}
            isFavorite={movie.isFavorite}
            isWatched={movie.isWatched}
            progress={movie.progress}
            showProgress={showProgress}
            priority={prioritizeFirst && index < 10}
            onToggleFavorite={() =>
              onToggleFavorite(movie.id, !!movie.isFavorite)
            }
            onToggleWatched={() =>
              onToggleWatched(movie.id, !!movie.isWatched)
            }
            onDelete={() => onDelete(movie.id)}
          />
          </AmbientHoverZone>
          );
        })}
      </ScrollRow>
  );
}

export default function HomePage() {
  const t = useTranslations("home");
  const queryClient = useQueryClient();
  const { data: prefs } = useUserPreferences();
  const mosaicConfig = prefs?.heroMosaicConfig;

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

  // Poster wall pool for the animated hero backdrop — the hero-wall endpoint
  // reads the SAVED mosaic config from the DB (per-library weights, year/
  // resolution/style filters) and returns a weighted random draw, so this can
  // fire immediately, in parallel with the prefs fetch — no config needed
  // client-side, which keeps the pre-wall dark gap to a single request.
  // Config changes don't ride the queryKey: the preferences page explicitly
  // invalidates ["movies","hero-wall"] on save, which busts staleTime:Infinity.
  const { data: wallMovies = [], isPending: wallPending } = useQuery<Movie[]>({
    queryKey: ["movies", "hero-wall"],
    queryFn: () =>
      fetch("/api/movies/hero-wall?limit=60").then((r) => r.json()),
    staleTime: Infinity, // keep the same draw while the page stays mounted
    refetchOnWindowFocus: false,
  });

  // People wall pool for the People tab — mirrors the movie wall query. The
  // hero-wall endpoint reads the SAVED peopleMosaicConfig server-side, so no
  // config rides the queryKey; the preferences page invalidates
  // ["people","hero-wall"] on save to bust staleTime:Infinity.
  const { data: peopleWall = [], isPending: peopleWallPending } = useQuery<
    PeopleWallEntry[]
  >({
    queryKey: ["people", "hero-wall"],
    queryFn: () =>
      fetch("/api/people/hero-wall?limit=60").then((r) => r.json()),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
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


  const deleteLibrary = useMutation({
    mutationFn: ({ id, cleanupOrphans, deleteNfo }: { id: string; cleanupOrphans: boolean; deleteNfo: boolean }) =>
      fetch(`/api/libraries/${id}?cleanupOrphans=${cleanupOrphans}&deleteNfo=${deleteNfo}`, { method: "DELETE" }),
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

  // Hero pool: up to 5 slides, deduped by id — the first few continue-watching
  // items, then recently-added items with fanart to fill out the carousel.
  const heroItems: { movie: Movie; isContinueWatching: boolean }[] = [];
  const heroIds = new Set<string>();
  for (const m of continueWatching.slice(0, 3)) {
    if (heroIds.has(m.id)) continue;
    heroIds.add(m.id);
    heroItems.push({ movie: m, isContinueWatching: true });
  }
  for (const m of recentlyAdded) {
    if (heroItems.length >= 5) break;
    if (!m.fanartPath || heroIds.has(m.id)) continue;
    heroIds.add(m.id);
    heroItems.push({ movie: m, isContinueWatching: false });
  }

  return (
    <AmbientProvider>
    <div className="relative flex h-full flex-col">
      {/* Ambilight: soft color field behind all home content. Root-level (the
          root div doesn't scroll — the inner div does), so the glow stays put
          while rows scroll through it. */}
      <AmbientField />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <Tabs defaultValue="home" className="relative flex h-full flex-col">
        {/* Floating glass pills (top-center) — poster-wall pill language */}
        <div className="absolute left-1/2 top-2 z-20 -translate-x-1/2">
          <TabsList className="flex h-auto gap-1.5 rounded-full border-0 bg-transparent p-1">
            <TabsTrigger
              value="home"
              className="glass-btn flex h-auto flex-none items-center whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] text-muted-foreground transition-fluid cursor-pointer hover:text-foreground data-[state=active]:!border-primary/50 data-[state=active]:!bg-primary/25 data-[state=active]:!text-foreground data-[state=active]:!shadow-none data-[state=active]:after:opacity-0"
            >
              {t("homeTab")}
            </TabsTrigger>
            <TabsTrigger
              value="favorites"
              className="glass-btn flex h-auto flex-none items-center whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] text-muted-foreground transition-fluid cursor-pointer hover:text-foreground data-[state=active]:!border-primary/50 data-[state=active]:!bg-primary/25 data-[state=active]:!text-foreground data-[state=active]:!shadow-none data-[state=active]:after:opacity-0"
            >
              {t("favoritesTab")}
            </TabsTrigger>
            <TabsTrigger
              value="people"
              className="glass-btn flex h-auto flex-none items-center whitespace-nowrap rounded-full px-4 py-1.5 text-[13px] text-muted-foreground transition-fluid cursor-pointer hover:text-foreground data-[state=active]:!border-primary/50 data-[state=active]:!bg-primary/25 data-[state=active]:!text-foreground data-[state=active]:!shadow-none data-[state=active]:after:opacity-0"
            >
              {t("peopleTab")}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
        <TabsContent value="home">
          {/* Render from the first frame while the wall pool loads (wallPending)
              so the hero's space is reserved — otherwise the whole page jumps
              down when the hero pops in after the fetch. */}
          {(wallPending || !prefs || heroItems.length > 0 || wallMovies.length > 0) && (
            <HomeHero
              items={heroItems}
              wallMovies={wallMovies}
              wallPending={wallPending || !prefs}
              mosaicConfig={mosaicConfig ?? DEFAULT_HERO_MOSAIC_CONFIG}
            />
          )}
          <div
            className={`stagger-children flex flex-col gap-6 px-4 pb-8 md:gap-10 md:px-12 ${
              wallPending || !prefs || heroItems.length > 0 || wallMovies.length > 0
                ? "relative z-10 pt-6 md:pt-8"
                : "pt-16"
            }`}
          >
            {/* Media Libraries */}
            {libraries.length > 0 ? (
              <ScrollRow title={t("mediaLibraries")}>
                {libraries.map((lib) => (
                  <LibraryCard
                    key={lib.id}
                    id={lib.id}
                    name={lib.name}
                    type={lib.type}
                    folderPaths={lib.folderPaths}
                    scraperEnabled={lib.scraperEnabled}
                    jellyfinCompat={lib.jellyfinCompat}
                    metadataLanguage={lib.metadataLanguage}
                    movieCount={lib.movieCount}
                    coverImage={lib.coverImage}
                    hasCustomCover={lib.hasCustomCover}
                    lastScannedAt={lib.lastScannedAt}
                    onScanComplete={() => {
                      queryClient.invalidateQueries({ queryKey: ["libraries"] });
                      queryClient.invalidateQueries({ queryKey: ["movies"] });
                    }}
                    onEditComplete={() => {
                      queryClient.invalidateQueries({ queryKey: ["libraries"] });
                    }}
                    onDelete={(opts) => deleteLibrary.mutate({ id: lib.id, ...opts })}
                    onEditImage={() => handleEditImage(lib.id)}
                    onRemoveImage={() => removeCover.mutate(lib.id)}
                  />
                ))}
              </ScrollRow>
            ) : (
              <ScrollRow title={t("mediaLibraries")}>
                <AddLibraryCard />
              </ScrollRow>
            )}

            {/* Continue Watching — landscape fanart cards */}
            {continueWatching.length > 0 && (
              <ScrollRow title={t("continueWatching")}>
                {continueWatching.map((movie) => (
                  <ContinueWatchingCard
                    key={movie.discLabel ? `${movie.id}-disc${movie.currentDisc}` : movie.id}
                    id={movie.id}
                    title={movie.title}
                    year={movie.year}
                    fanartPath={movie.fanartPath}
                    posterPath={movie.posterPath}
                    posterBlur={movie.posterBlur}
                    progress={movie.progress}
                    discLabel={movie.discLabel}
                    currentDisc={movie.currentDisc}
                  />
                ))}
              </ScrollRow>
            )}

            {/* Recently Added — first MovieCard row below the hero/library/continue-watching
                rows, so it's the closest thing to an above-the-fold poster grid on this page. */}
            <MovieRow
              title={t("recentlyAdded")}
              movies={recentlyAdded}
              prioritizeFirst
              onToggleFavorite={handleToggleFavorite}
              onToggleWatched={handleToggleWatched}
              onDelete={handleDeleteMovie}
            />

            {/* Favorites — below the fold, stays lazy */}
            <MovieRow
              title={t("favorites")}
              movies={favorites}
              onToggleFavorite={handleToggleFavorite}
              onToggleWatched={handleToggleWatched}
              onDelete={handleDeleteMovie}
            />

          </div>
        </TabsContent>

        <TabsContent value="favorites">
          <div className="px-4 md:px-12 pb-8 pt-14">
            <FavoritesBrowser />
          </div>
        </TabsContent>

        {/* People — full-page animated wall, no rows below it. h-full chains the
            height down from the flex-1 scroll wrapper so PeopleHero's h-full root
            fills the viewport (mt-0 neutralizes any TabsContent default margin). */}
        <TabsContent value="people" className="mt-0 h-full">
          <PeopleHero
            entries={peopleWall}
            pending={peopleWallPending || !prefs}
            config={prefs?.peopleMosaicConfig ?? DEFAULT_PEOPLE_MOSAIC_CONFIG}
          />
        </TabsContent>
        </div>
      </Tabs>
    </div>
    </AmbientProvider>
  );
}

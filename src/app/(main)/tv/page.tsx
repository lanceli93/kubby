"use client";

import { Suspense, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShowCard } from "@/components/tv/show-card";
import { NextUpCard } from "@/components/tv/next-up-card";
import { TvHero, type TvHeroShow } from "@/components/tv/tv-hero";
import { LibraryCard } from "@/components/library/library-card";
import { AddLibraryCard } from "@/components/library/add-library-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import {
  AmbientProvider,
  AmbientField,
} from "@/components/home/ambient-field";
import { type MosaicMovie } from "@/components/home/hero-mosaic";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { DEFAULT_HERO_MOSAIC_CONFIG } from "@/lib/hero-mosaic-config";
import { useTranslations } from "next-intl";

interface ShowItem {
  id: string;
  title: string;
  year?: number | null;
  overview?: string | null;
  status?: string | null;
  communityRating?: number | null;
  personalRating?: number | null;
  posterPath?: string | null;
  posterBlur?: string | null;
  fanartPath?: string | null;
  seasonCount?: number | null;
  episodeCount?: number | null;
}

interface NextUpItem {
  showId: string;
  showTitle: string;
  showPosterPath?: string | null;
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string | null;
  stillPath?: string | null;
  stillBlur?: string | null;
  playbackPositionSeconds: number;
  runtimeSeconds: number;
  progress: number;
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

export default function TvHomePage() {
  return (
    <Suspense>
      <TvHomeContent />
    </Suspense>
  );
}

// The TV home is a clean hero landing page (mirroring the cinema home `/`).
// The full tabbed browse grid — All Shows / Favorites / Genres / People, sort,
// filters, and the WebGL poster wall — lives on the dedicated `/tv/browse`
// route; clicking a library card here navigates there with `?libraryId=`.
function TvHomeContent() {
  const t = useTranslations("tv");
  const tHome = useTranslations("home");
  const queryClient = useQueryClient();
  // TV poster-wall layout (columns/style/angle/flow) — the TV-domain twin of the
  // cinema home's heroMosaicConfig. Drives the mosaic layout only; the /api/tv
  // hero-wall pool is a plain random draw (TV shows carry no year/resolution to
  // filter on server-side). Default config keeps today's classic wall.
  const { data: prefs } = useUserPreferences();
  const mosaicConfig = prefs?.tvHeroMosaicConfig ?? DEFAULT_HERO_MOSAIC_CONFIG;

  // ── Media libraries (TV only — positive allowlist, never a blocklist) ──
  const { data: allLibraries = [] } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
  });
  const libraries = allLibraries.filter((lib) => lib.type === "tvshow");

  const deleteLibrary = useMutation({
    mutationFn: (id: string) => fetch(`/api/libraries/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      queryClient.invalidateQueries({ queryKey: ["tv-shows"] });
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingLibraryIdRef = useRef<string | null>(null);
  const uploadCover = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetch(`/api/libraries/${id}/cover`, { method: "POST", body: formData });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["libraries"] }),
  });
  const removeCover = useMutation({
    mutationFn: (id: string) => fetch(`/api/libraries/${id}/cover`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["libraries"] }),
  });
  const handleEditImage = useCallback((id: string) => {
    pendingLibraryIdRef.current = id;
    fileInputRef.current?.click();
  }, []);
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const id = pendingLibraryIdRef.current;
      if (file && id) uploadCover.mutate({ id, file });
      pendingLibraryIdRef.current = null;
      e.target.value = "";
    },
    [uploadCover]
  );

  // ── Poster wall pool for the animated hero backdrop ──────────────
  const { data: wallShows = [], isPending: wallPending } = useQuery<MosaicMovie[]>({
    queryKey: ["tv-shows", "hero-wall"],
    queryFn: () => fetch("/api/tv/hero-wall?limit=60").then((r) => r.json()),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // ── Continue Watching / Next Up ──────────────────────────────────
  const { data: nextUp = [] } = useQuery<NextUpItem[]>({
    queryKey: ["tv-next-up"],
    queryFn: () => fetch("/api/tv?filter=next-up").then((r) => r.json()),
  });

  // ── Recently Added ───────────────────────────────────────────────
  const { data: recentlyAdded = [] } = useQuery<ShowItem[]>({
    queryKey: ["tv-recently-added"],
    queryFn: () => fetch("/api/tv?filter=recently-added").then((r) => r.json()),
  });

  // Richer metadata for the hero spotlight text block, keyed by show id — drawn
  // from the recently-added query the page already runs.
  const detailsById = new Map<string, TvHeroShow>();
  for (const s of recentlyAdded) {
    if (!detailsById.has(s.id)) detailsById.set(s.id, s);
  }

  return (
    <AmbientProvider>
      <div className="relative flex h-full flex-col">
        <AmbientField />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

        <div className="flex-1 overflow-y-scroll scrollbar-hide">
          {(wallPending || wallShows.length > 0) && (
            <TvHero wallShows={wallShows} wallPending={wallPending} detailsById={detailsById} mosaicConfig={mosaicConfig} />
          )}

          <div
            className={`animate-fade-in-up px-4 md:px-12 ${
              wallPending || wallShows.length > 0 ? "relative z-10 pt-6 md:pt-8" : "pt-6"
            }`}
          >
            {/* Media Libraries */}
            {libraries.length > 0 ? (
              <section className="pb-2">
                <ScrollRow title={tHome("mediaLibraries")}>
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
                      coverImage={lib.coverImage}
                      hasCustomCover={lib.hasCustomCover}
                      lastScannedAt={lib.lastScannedAt}
                      hrefBase="/tv/browse"
                      countLabel={lib.movieCount != null ? t("episodeCount", { count: lib.movieCount }) : undefined}
                      onScanComplete={() => {
                        queryClient.invalidateQueries({ queryKey: ["libraries"] });
                        queryClient.invalidateQueries({ queryKey: ["tv-shows"] });
                      }}
                      onEditComplete={() => queryClient.invalidateQueries({ queryKey: ["libraries"] })}
                      onDelete={() => deleteLibrary.mutate(lib.id)}
                      onEditImage={() => handleEditImage(lib.id)}
                      onRemoveImage={() => removeCover.mutate(lib.id)}
                    />
                  ))}
                </ScrollRow>
              </section>
            ) : (
              <section className="pb-2">
                <ScrollRow title={tHome("mediaLibraries")}>
                  <AddLibraryCard />
                </ScrollRow>
              </section>
            )}

            {/* Continue Watching / Next Up band */}
            {nextUp.length > 0 && (
              <section className="pt-4">
                <ScrollRow title={t("continueWatching")}>
                  {nextUp.map((item) => (
                    <NextUpCard
                      key={item.episodeId}
                      showTitle={item.showTitle}
                      episodeId={item.episodeId}
                      seasonNumber={item.seasonNumber}
                      episodeNumber={item.episodeNumber}
                      episodeTitle={item.episodeTitle}
                      stillPath={item.stillPath}
                      stillBlur={item.stillBlur}
                      showPosterPath={item.showPosterPath}
                      progress={item.progress}
                    />
                  ))}
                </ScrollRow>
              </section>
            )}

            {/* Recently Added band */}
            {recentlyAdded.length > 0 && (
              <section className="pt-4 pb-8">
                <ScrollRow title={t("recentlyAdded")}>
                  {recentlyAdded.map((show) => (
                    <ShowCard
                      key={show.id}
                      id={show.id}
                      title={show.title}
                      year={show.year}
                      posterPath={show.posterPath}
                      posterBlur={show.posterBlur}
                      personalRating={show.personalRating}
                    />
                  ))}
                </ScrollRow>
              </section>
            )}
          </div>
        </div>
      </div>
    </AmbientProvider>
  );
}

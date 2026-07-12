"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { ShowCard } from "@/components/tv/show-card";
import { NextUpCard } from "@/components/tv/next-up-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useTranslations } from "next-intl";
import { ArrowUpDown, CalendarPlus, ArrowDownAZ, Calendar, Sparkles, Loader2 } from "lucide-react";

interface ShowItem {
  id: string;
  title: string;
  year?: number | null;
  posterPath?: string | null;
  posterBlur?: string | null;
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

interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

const PAGE_SIZE = 60;

export default function TvBrowsePage() {
  return (
    <Suspense>
      <TvBrowseContent />
    </Suspense>
  );
}

function TvBrowseContent() {
  const searchParams = useSearchParams();
  const t = useTranslations("tv");
  const tMovies = useTranslations("movies");
  // libraryId is optional — omitted, the API lists across all TV libraries.
  const libraryId = searchParams.get("libraryId") || "";

  const [sort, setSort] = useState("dateAdded");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortOptions: SortOption[] = [
    { value: "dateAdded", label: tMovies("dateAdded"), icon: CalendarPlus },
    { value: "title", label: tMovies("titleAZ"), icon: ArrowDownAZ },
    { value: "year", label: tMovies("year"), icon: Calendar },
    { value: "rating", label: tMovies("rating"), icon: Sparkles },
  ];

  // ── Continue Watching / Next Up ──────────────────────────────────
  const { data: nextUp = [] } = useQuery<NextUpItem[]>({
    queryKey: ["tv-next-up"],
    queryFn: () => fetch(`/api/tv?filter=next-up`).then((r) => r.json()),
  });

  // ── Recently Added ───────────────────────────────────────────────
  const { data: recentlyAdded = [] } = useQuery<ShowItem[]>({
    queryKey: ["tv-recently-added", libraryId],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("filter", "recently-added");
      if (libraryId) params.set("libraryId", libraryId);
      return fetch(`/api/tv?${params}`).then((r) => r.json());
    },
  });

  // ── All Shows (infinite grid) ────────────────────────────────────
  const {
    data: showsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedResponse<ShowItem>>({
    queryKey: ["tv-shows", { libraryId, sort, sortOrder }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      params.set("sort", sort);
      params.set("sortOrder", sortOrder);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(pageParam));
      return fetch(`/api/tv?${params}`).then((r) => r.json());
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
  });

  const shows = showsData?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = showsData?.pages[0]?.totalCount ?? 0;
  const { sentinelRef } = useInfiniteScroll({ hasNextPage, isFetchingNextPage, fetchNextPage });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-scroll px-4 md:px-12">
        <div className="animate-fade-in-up">
          {/* Continue Watching / Next Up band */}
          {nextUp.length > 0 && (
            <section className="pt-6">
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
            <section className="pt-6">
              <ScrollRow title={t("recentlyAdded")}>
                {recentlyAdded.map((show) => (
                  <ShowCard
                    key={show.id}
                    id={show.id}
                    title={show.title}
                    year={show.year}
                    posterPath={show.posterPath}
                    posterBlur={show.posterBlur}
                  />
                ))}
              </ScrollRow>
            </section>
          )}

          {/* All Shows grid — left-aligned so the first column lines up with the
              bands + heading above it; minmax columns stretch to fill the row. */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,minmax(150px,180px))] md:gap-x-4 md:gap-y-6">
            <div className="col-span-full relative py-[18px] flex items-center justify-center">
              <span className="absolute left-0 text-sm text-muted-foreground whitespace-nowrap">
                {t("allShows")} · {totalCount || shows.length}
              </span>
              <SortDropdown
                options={sortOptions}
                sort={sort}
                sortOrder={sortOrder}
                onSortChange={setSort}
                onOrderChange={setSortOrder}
              />
            </div>

            {shows.map((show, index) => (
              <ShowCard
                key={show.id}
                id={show.id}
                title={show.title}
                year={show.year}
                posterPath={show.posterPath}
                posterBlur={show.posterBlur}
                subtitle={show.episodeCount ? t("episodeCount", { count: show.episodeCount }) : undefined}
                responsive
                priority={index < 10}
              />
            ))}

            <div ref={sentinelRef} className="col-span-full" style={{ height: 1 }} />
            {isFetchingNextPage && (
              <div className="col-span-full flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && shows.length === 0 && (
              <div className="col-span-full flex h-64 items-center justify-center text-muted-foreground">
                {t("noEpisodes")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Glass sort dropdown — a simplified port of the music sort dropdown ───

interface SortOption {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function SortDropdown({
  options,
  sort,
  sortOrder,
  onSortChange,
  onOrderChange,
}: {
  options: SortOption[];
  sort: string;
  sortOrder: "asc" | "desc";
  onSortChange: (value: string) => void;
  onOrderChange: (order: "asc" | "desc") => void;
}) {
  const tMusic = useTranslations("music");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="focus-ring glass-btn flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground transition-fluid hover:text-foreground active:scale-95 cursor-pointer"
      >
        <ArrowUpDown className="h-4 w-4" />
        {tMusic("sortBy")}
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1 w-[220px] -translate-x-1/2 rounded-[10px] border border-white/[0.08] bg-[rgba(10,10,15,0.78)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_0.5px_0_rgba(255,255,255,0.1)] py-1.5">
          {options.map((option) => {
            const Icon = option.icon;
            const isActive = sort === option.value;
            return (
              <button
                key={option.value}
                onClick={() => onSortChange(option.value)}
                className={`focus-ring flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                  isActive
                    ? "bg-primary/[0.08] text-foreground"
                    : "text-[#d0d0e0] hover:bg-white/[0.04]"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-[#666680]"}`} />
                {option.label}
              </button>
            );
          })}
          <div className="my-1.5 border-t border-white/[0.06]" />
          <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {tMusic("sortOrder")}
          </p>
          <button
            onClick={() => onOrderChange("asc")}
            className={`focus-ring flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
              sortOrder === "asc" ? "bg-primary/[0.08] text-foreground" : "text-[#d0d0e0] hover:bg-white/[0.04]"
            }`}
          >
            <span className={`h-3 w-3 rounded-full border-2 ${sortOrder === "asc" ? "border-primary bg-primary" : "border-[#666680]"}`} />
            {tMusic("ascending")}
          </button>
          <button
            onClick={() => onOrderChange("desc")}
            className={`focus-ring flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
              sortOrder === "desc" ? "bg-primary/[0.08] text-foreground" : "text-[#d0d0e0] hover:bg-white/[0.04]"
            }`}
          >
            <span className={`h-3 w-3 rounded-full border-2 ${sortOrder === "desc" ? "border-primary bg-primary" : "border-[#666680]"}`} />
            {tMusic("descending")}
          </button>
        </div>
      )}
    </div>
  );
}

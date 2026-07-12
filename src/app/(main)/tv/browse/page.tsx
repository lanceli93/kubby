"use client";

import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { ShowCard } from "@/components/tv/show-card";
import { PersonCard } from "@/components/people/person-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";
import {
  ArrowUpDown,
  ArrowDownAZ,
  CalendarPlus,
  Calendar,
  Sparkles,
  Filter,
  ChevronDown,
  ChevronRight,
  X,
  Hash,
  Boxes,
  Loader2,
} from "lucide-react";

// Three.js lives entirely inside PosterWall; dynamic() keeps it out of the
// initial page bundle and only fetches the chunk when the wall is opened.
const PosterWall = dynamic(
  () => import("@/components/movie/poster-wall").then((m) => m.PosterWall),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

// True only in the browser when WebGL2 is available, viewport is ≥ md, and the
// user hasn't requested reduced motion — the poster wall is opt-in and
// desktop-first. Replicated from the movies page (defined locally there too).
function usePosterWallAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const check = () => {
      const hasWebGL = !!document.createElement("canvas").getContext("webgl2");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const wideEnough = window.matchMedia("(min-width: 768px)").matches;
      setAvailable(hasWebGL && !reduced && wideEnough);
    };
    check();
    const mq = window.matchMedia("(min-width: 768px)");
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, []);
  return available;
}

interface ShowItem {
  id: string;
  title: string;
  year?: number | null;
  posterPath?: string | null;
  posterBlur?: string | null;
  communityRating?: number | null;
  personalRating?: number | null;
  dateAdded?: string | null;
  episodeCount?: number | null;
  isFavorite?: boolean;
}

interface PersonItem {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
  photoBlur?: string | null;
  showCount: number;
  isFavorite?: boolean;
  personalRating?: number | null;
}

interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// Only the metadata the poster wall renders / sorts on. TV shows carry no
// runtime / resolution / fileSize per-title, so those stay null.
interface PosterWallMovie {
  id: string;
  title: string;
  posterPath?: string | null;
  year?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoCodec?: string | null;
  fileSize?: number | null;
  runtimeSeconds?: number | null;
  runtimeMinutes?: number | null;
  communityRating?: number | null;
  personalRating?: number | null;
  dateAdded?: string | null;
}

interface FiltersData {
  genres: string[];
  tags: string[];
  years: number[];
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
  const router = useRouter();
  const pathname = usePathname();
  const libraryId = searchParams.get("libraryId") || "";
  const personId = searchParams.get("personId") || "";
  const tMovies = useTranslations("movies");
  const t = useTranslations("tv");

  // Derive active tab: if URL has genre/tag/studio filter, force the "shows" tab.
  const urlHasFilter = searchParams.get("genre") || searchParams.get("tag") || searchParams.get("studio");
  const [activeTab, setActiveTab] = useState(() =>
    urlHasFilter ? "shows" : (searchParams.get("tab") || "shows")
  );

  // Switch to "shows" tab when filter params appear in the URL.
  useEffect(() => {
    if (urlHasFilter) setActiveTab("shows");
  }, [urlHasFilter]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab !== "shows") params.set("tab", tab);
    else params.delete("tab");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname]);

  // Person filmography mode — no tabs, just a shows grid (peer of the cinema
  // page's PersonMoviesContent).
  if (personId) {
    return (
      <div className="h-full overflow-y-scroll px-4 md:px-12">
        <PersonShowsContent personId={personId} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
        <div className="flex justify-center border-b border-white/[0.06] bg-[var(--header)]">
          <TabsList variant="line">
            <TabsTrigger value="shows" className="transition-fluid cursor-pointer">{t("shows")}</TabsTrigger>
            <TabsTrigger value="favorites" className="transition-fluid cursor-pointer">{tMovies("favorites")}</TabsTrigger>
            <TabsTrigger value="genres" className="transition-fluid cursor-pointer">{tMovies("genres")}</TabsTrigger>
            <TabsTrigger value="people" className="transition-fluid cursor-pointer">{t("people")}</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-scroll px-4 md:px-12">
          <TabsContent value="shows">
            <ShowsTabContent libraryId={libraryId} />
          </TabsContent>

          <TabsContent value="favorites">
            <FavoritesTabContent libraryId={libraryId} />
          </TabsContent>

          <TabsContent value="genres">
            <GenresTabContent libraryId={libraryId} />
          </TabsContent>

          <TabsContent value="people">
            <PeopleTabContent libraryId={libraryId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function ShowsTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("tv");
  const tMovies = useTranslations("movies");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlGenre = searchParams.get("genre") || "";
  const urlTag = searchParams.get("tag") || "";
  const urlStudio = searchParams.get("studio") || "";

  const [sort, setSort] = useState(() => searchParams.get("sort") || "dateAdded");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(() =>
    (searchParams.get("sortOrder") as "asc" | "desc") || "desc"
  );
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() => {
    const urlGenres = searchParams.get("genres");
    return urlGenres ? urlGenres.split(",") : urlGenre ? [urlGenre] : [];
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const urlTags = searchParams.get("tags");
    return urlTags ? urlTags.split(",") : urlTag ? [urlTag] : [];
  });
  const [selectedYears, setSelectedYears] = useState<number[]>(() => {
    const urlYears = searchParams.get("years");
    return urlYears ? urlYears.split(",").map(Number).filter(Boolean) : [];
  });
  const [genresExpanded, setGenresExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [yearsExpanded, setYearsExpanded] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const sortOptions: SortOption[] = [
    { value: "dateAdded", label: tMovies("dateAdded"), icon: CalendarPlus },
    { value: "title", label: tMovies("titleAZ"), icon: ArrowDownAZ },
    { value: "year", label: tMovies("year"), icon: Calendar },
    { value: "rating", label: tMovies("rating"), icon: Sparkles },
  ];

  // Sync sort/filter state to URL params for persistence across navigation.
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (sort !== "dateAdded") params.set("sort", sort);
    else params.delete("sort");
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    else params.delete("sortOrder");
    if (selectedGenres.length > 0) params.set("genres", selectedGenres.join(","));
    else params.delete("genres");
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
    else params.delete("tags");
    if (selectedYears.length > 0) params.set("years", selectedYears.join(","));
    else params.delete("years");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [sort, sortOrder, selectedGenres, selectedTags, selectedYears, router, pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: filters } = useQuery<FiltersData>({
    queryKey: ["tv-filters", libraryId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      return fetch(`/api/tv/filters?${params}`).then((r) => r.json());
    },
  });

  // Shared query-param builder so the poster wall fetches the same filtered set.
  const buildShowParams = useCallback(() => {
    const params = new URLSearchParams();
    if (libraryId) params.set("libraryId", libraryId);
    params.set("sort", sort);
    params.set("sortOrder", sortOrder);
    if (selectedGenres.length > 0) params.set("genres", selectedGenres.join(","));
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
    if (selectedYears.length > 0) params.set("years", selectedYears.join(","));
    if (urlTag && selectedTags.length === 0) params.set("tag", urlTag);
    if (urlStudio) params.set("studio", urlStudio);
    return params;
  }, [libraryId, sort, sortOrder, selectedGenres, selectedTags, selectedYears, urlTag, urlStudio]);

  const {
    data: showsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedResponse<ShowItem>>({
    queryKey: ["tv-shows", { libraryId, sort, sortOrder, selectedGenres, selectedTags, selectedYears, urlTag, urlStudio }],
    queryFn: ({ pageParam }) => {
      const params = buildShowParams();
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

  // Poster wall (WebGL) browse mode — opt-in, per session, desktop only.
  const posterWallAvailable = usePosterWallAvailable();
  const [showPosterWall, setShowPosterWall] = useState(false);
  const [wallShows, setWallShows] = useState<PosterWallMovie[] | null>(null);
  const [wallLoadingMore, setWallLoadingMore] = useState(false);
  const wallLoadToken = useRef(0);

  const toWallShow = useCallback((s: ShowItem): PosterWallMovie => ({
    id: s.id,
    title: s.title,
    posterPath: s.posterPath,
    year: s.year,
    videoWidth: null,
    videoHeight: null,
    videoCodec: null,
    fileSize: null,
    runtimeSeconds: null,
    runtimeMinutes: null,
    communityRating: s.communityRating,
    personalRating: s.personalRating,
    dateAdded: s.dateAdded,
  }), []);

  const openPosterWall = useCallback(async () => {
    setShowPosterWall(true);
    setWallShows(null);
    setWallLoadingMore(true);
    const token = ++wallLoadToken.current;

    const acc: PosterWallMovie[] = [];
    let o = 0;
    try {
      for (;;) {
        const params = buildShowParams();
        params.set("offset", String(o));
        params.set("limit", "200");
        const data: PaginatedResponse<ShowItem> = await fetch(
          `/api/tv?${params}`,
        ).then((r) => r.json());
        // Wall was closed or reopened while this page was in flight — abort.
        if (wallLoadToken.current !== token) return;
        for (const s of data.items) acc.push(toWallShow(s));
        setWallShows([...acc]);
        o += data.limit;
        if (!data.hasMore) break;
      }
    } catch {
      if (wallLoadToken.current !== token) return;
      if (acc.length === 0) setWallShows([]);
    } finally {
      if (wallLoadToken.current === token) setWallLoadingMore(false);
    }
  }, [buildShowParams, toWallShow]);

  const closePosterWall = useCallback(() => {
    wallLoadToken.current++; // cancel any in-flight progressive loop
    setShowPosterWall(false);
    setWallShows(null);
    setWallLoadingMore(false);
  }, []);

  const activeFilterCount = selectedGenres.length + selectedTags.length + selectedYears.length;

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  };

  const toggleYear = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    );
  };

  const clearFilters = () => {
    setSelectedGenres([]);
    setSelectedTags([]);
    setSelectedYears([]);
  };

  return (
    <div className="animate-fade-in-up grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,180px)] md:gap-x-4 md:gap-y-6 justify-center">
      {/* Sort & Filter Toolbar — spans full grid width, count aligns with first card */}
      <div className="col-span-full relative py-[18px] flex items-center justify-center">
        <span className="absolute left-0 text-sm text-muted-foreground whitespace-nowrap">
          {t("allShows")} · {totalCount || shows.length}
        </span>
        <div className="flex items-center gap-3">
          {/* Sort button */}
          <SortDropdown
            options={sortOptions}
            sort={sort}
            sortOrder={sortOrder}
            onSortChange={setSort}
            onOrderChange={setSortOrder}
          />

          {/* Filter button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterDropdown((v) => !v)}
              className="glass-btn flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground transition-fluid hover:text-foreground active:scale-95 cursor-pointer"
            >
              <Filter className="h-4 w-4" />
              {tMovies("filter")}
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {showFilterDropdown && (
              <div className="absolute left-1/2 top-full z-50 mt-1 w-[260px] max-h-[400px] -translate-x-1/2 overflow-y-auto rounded-[10px] border border-white/[0.08] bg-[rgba(10,10,15,0.78)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_0.5px_0_rgba(255,255,255,0.1)] py-1.5">
                {/* Clear all */}
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="flex w-full items-center gap-2 px-4 py-2 text-[13px] text-red-400 transition-colors hover:bg-white/[0.04]"
                  >
                    <X className="h-3.5 w-3.5" />
                    {tMovies("clearFilters")}
                  </button>
                )}

                {/* Genres section */}
                {filters && filters.genres.length > 0 && (
                  <>
                    <button
                      onClick={() => setGenresExpanded(!genresExpanded)}
                      className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground"
                    >
                      {genresExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {tMovies("genres")}
                    </button>
                    {genresExpanded &&
                      filters.genres.map((genre) => {
                        const checked = selectedGenres.includes(genre);
                        return (
                          <button
                            key={genre}
                            onClick={() => toggleGenre(genre)}
                            className={`flex h-[34px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${checked ? "text-foreground" : "text-[#d0d0e0] hover:bg-white/[0.04]"}`}
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-white" : "border-[#666680]"}`}>
                              {checked && <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </span>
                            {genre}
                          </button>
                        );
                      })}
                  </>
                )}

                {/* Years section */}
                {filters && filters.years.length > 0 && (
                  <>
                    <div className="my-1.5 border-t border-white/[0.06]" />
                    <button
                      onClick={() => setYearsExpanded(!yearsExpanded)}
                      className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground"
                    >
                      {yearsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {tMovies("year")}
                    </button>
                    {yearsExpanded &&
                      filters.years.map((year) => {
                        const checked = selectedYears.includes(year);
                        return (
                          <button
                            key={year}
                            onClick={() => toggleYear(year)}
                            className={`flex h-[34px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${checked ? "text-foreground" : "text-[#d0d0e0] hover:bg-white/[0.04]"}`}
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-white" : "border-[#666680]"}`}>
                              {checked && <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </span>
                            {year}
                          </button>
                        );
                      })}
                  </>
                )}

                {/* Tags section */}
                {filters && filters.tags.length > 0 && (
                  <>
                    <div className="my-1.5 border-t border-white/[0.06]" />
                    <button
                      onClick={() => setTagsExpanded(!tagsExpanded)}
                      className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground"
                    >
                      {tagsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {tMovies("tags")}
                    </button>
                    {tagsExpanded &&
                      filters.tags.map((tag) => {
                        const checked = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`flex h-[34px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${checked ? "text-foreground" : "text-[#d0d0e0] hover:bg-white/[0.04]"}`}
                          >
                            <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-white" : "border-[#666680]"}`}>
                              {checked && <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                            </span>
                            {tag}
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Poster wall (WebGL) toggle — desktop + WebGL only */}
          {posterWallAvailable && (
            <button
              onClick={openPosterWall}
              className="glass-btn flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground transition-fluid hover:text-foreground active:scale-95 cursor-pointer"
            >
              <Boxes className="h-4 w-4" />
              {tMovies("posterWall")}
            </button>
          )}
        </div>
      </div>

      {showPosterWall && wallShows && (
        <PosterWall
          movies={wallShows}
          hrefBase="/tv"
          onClose={closePosterWall}
          loadingMore={wallLoadingMore}
          initialSort={{ key: sort, order: sortOrder }}
        />
      )}
      {showPosterWall && !wallShows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Show cards */}
      {shows.map((show, index) => (
        <ShowCard
          key={show.id}
          id={show.id}
          title={show.title}
          year={show.year}
          posterPath={show.posterPath}
          posterBlur={show.posterBlur}
          personalRating={show.personalRating}
          subtitle={show.episodeCount ? t("episodeCount", { count: show.episodeCount }) : undefined}
          responsive
          priority={index < 10}
        />
      ))}

      {/* Infinite scroll sentinel */}
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
  );
}

function FavoritesTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("tv");
  const tMovies = useTranslations("movies");

  const { data: shows = [], isLoading } = useQuery<ShowItem[]>({
    queryKey: ["tv-shows", "favorites", libraryId],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("filter", "favorites");
      if (libraryId) params.set("libraryId", libraryId);
      return fetch(`/api/tv?${params}`).then((r) => r.json());
    },
  });

  return (
    <div className="animate-fade-in-up grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,180px)] md:gap-x-4 md:gap-y-6 justify-center pt-6">
      {shows.map((show, index) => (
        <ShowCard
          key={show.id}
          id={show.id}
          title={show.title}
          year={show.year}
          posterPath={show.posterPath}
          posterBlur={show.posterBlur}
          personalRating={show.personalRating}
          subtitle={show.episodeCount ? t("episodeCount", { count: show.episodeCount }) : undefined}
          responsive
          priority={index < 10}
        />
      ))}

      {!isLoading && shows.length === 0 && (
        <div className="col-span-full flex h-64 items-center justify-center text-muted-foreground">
          {tMovies("noFavorites")}
        </div>
      )}
    </div>
  );
}

const GENRES_PER_PAGE = 8;

function GenresTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("tv");
  const [visibleCount, setVisibleCount] = useState(GENRES_PER_PAGE);

  const { data: genres = [] } = useQuery<string[]>({
    queryKey: ["tv-genres", libraryId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      return fetch(`/api/tv/genres?${params}`).then((r) => r.json());
    },
  });

  const visibleGenres = genres.slice(0, visibleCount);
  const hasMore = visibleCount < genres.length;

  const { sentinelRef } = useInfiniteScroll({
    hasNextPage: hasMore,
    isFetchingNextPage: false,
    fetchNextPage: () => setVisibleCount((c) => c + GENRES_PER_PAGE),
  });

  if (genres.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center pt-4 text-muted-foreground">
        {t("noEpisodes")}
      </div>
    );
  }

  return (
    <div className="stagger-children flex flex-col gap-8 py-6">
      {visibleGenres.map((genre) => (
        <GenreScrollRow key={genre} genre={genre} libraryId={libraryId} />
      ))}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}

function GenreScrollRow({ genre, libraryId }: { genre: string; libraryId: string }) {
  const t = useTranslations("tv");

  const { data: shows = [] } = useQuery<ShowItem[]>({
    queryKey: ["tv-shows", "genre-row", libraryId, genre],
    queryFn: () => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      params.set("genre", genre);
      params.set("limit", "50");
      return fetch(`/api/tv?${params}`).then((r) => r.json());
    },
  });

  const genreHref = libraryId
    ? `/tv/browse?libraryId=${libraryId}&genre=${encodeURIComponent(genre)}`
    : `/tv/browse?genre=${encodeURIComponent(genre)}`;

  return (
    <section className="flex flex-col gap-3">
      <ScrollRow
        title={
          <Link
            href={genreHref}
            className="hover:text-white hover:underline transition-colors"
          >
            {genre}
          </Link>
        }
      >
        {shows.map((show) => (
          <ShowCard
            key={show.id}
            id={show.id}
            title={show.title}
            year={show.year}
            posterPath={show.posterPath}
            posterBlur={show.posterBlur}
            personalRating={show.personalRating}
            subtitle={show.episodeCount ? t("episodeCount", { count: show.episodeCount }) : undefined}
          />
        ))}
      </ScrollRow>
    </section>
  );
}

function PeopleTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("tv");
  const tMovies = useTranslations("movies");
  const [sort, setSort] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const sortOptions: SortOption[] = [
    { value: "name", label: tMovies("nameAZ"), icon: ArrowDownAZ },
    { value: "showCount", label: t("showCount"), icon: Hash },
    { value: "dateAdded", label: tMovies("dateAdded"), icon: CalendarPlus },
  ];

  const {
    data: peopleData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedResponse<PersonItem>>({
    queryKey: ["tv-people", { libraryId, sort, sortOrder }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      params.set("sort", sort);
      params.set("sortOrder", sortOrder);
      params.set("offset", String(pageParam));
      return fetch(`/api/tv/people?${params}`).then((r) => r.json());
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
  });

  const people = peopleData?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = peopleData?.pages[0]?.totalCount ?? 0;
  const { sentinelRef } = useInfiniteScroll({ hasNextPage, isFetchingNextPage, fetchNextPage });

  return (
    <div className="animate-fade-in-up grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,180px)] md:gap-x-4 md:gap-y-6 justify-center">
      {/* Sort Toolbar — count aligns with first card */}
      <div className="col-span-full relative py-[18px] flex items-center justify-center">
        <span className="absolute left-0 text-sm text-muted-foreground whitespace-nowrap">
          {t("peopleCount", { count: totalCount || people.length })}
        </span>
        <SortDropdown
          options={sortOptions}
          sort={sort}
          sortOrder={sortOrder}
          onSortChange={(value) => {
            setSort(value);
            setSortOrder(value === "name" ? "asc" : "desc");
          }}
          onOrderChange={setSortOrder}
        />
      </div>

      {/* Person cards — readonly (the TV person page owns favoriting), scoped to /tv/people */}
      {people.map((person) => (
        <PersonCard
          key={person.id}
          id={person.id}
          name={person.name}
          role={t("showCountLabel", { count: person.showCount })}
          photoPath={person.photoPath}
          photoBlur={person.photoBlur}
          personalRating={person.personalRating}
          isFavorite={person.isFavorite}
          size="movie"
          hrefBase="/tv/people"
          readonly
        />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="col-span-full" style={{ height: 1 }} />
      {isFetchingNextPage && (
        <div className="col-span-full flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && people.length === 0 && (
        <div className="col-span-full flex h-64 items-center justify-center text-muted-foreground">
          {t("noPeople")}
        </div>
      )}
    </div>
  );
}

function PersonShowsContent({ personId }: { personId: string }) {
  const t = useTranslations("tv");
  const tMovies = useTranslations("movies");
  const [sort, setSort] = useState("year");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortOptions: SortOption[] = [
    { value: "year", label: tMovies("year"), icon: Calendar },
    { value: "title", label: tMovies("titleAZ"), icon: ArrowDownAZ },
    { value: "dateAdded", label: tMovies("dateAdded"), icon: CalendarPlus },
    { value: "rating", label: tMovies("rating"), icon: Sparkles },
  ];

  const { data: shows = [], isLoading } = useQuery<ShowItem[]>({
    queryKey: ["tv-shows", { personId, sort, sortOrder }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("personId", personId);
      params.set("sort", sort);
      params.set("sortOrder", sortOrder);
      params.set("limit", "500");
      return fetch(`/api/tv?${params}`).then((r) => r.json());
    },
  });

  return (
    <div className="animate-fade-in-up grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,180px)] md:gap-x-4 md:gap-y-6 justify-center">
      {/* Sort Toolbar */}
      <div className="col-span-full py-[18px] flex items-center">
        <span className="min-w-[80px] text-sm text-muted-foreground whitespace-nowrap">
          {t("showsCount", { count: shows.length })}
        </span>
        <div className="flex flex-1 items-center justify-center gap-3">
          <SortDropdown
            options={sortOptions}
            sort={sort}
            sortOrder={sortOrder}
            onSortChange={setSort}
            onOrderChange={setSortOrder}
          />
        </div>
      </div>

      {shows.map((show, index) => (
        <ShowCard
          key={show.id}
          id={show.id}
          title={show.title}
          year={show.year}
          posterPath={show.posterPath}
          posterBlur={show.posterBlur}
          personalRating={show.personalRating}
          subtitle={show.episodeCount ? t("episodeCount", { count: show.episodeCount }) : undefined}
          responsive
          priority={index < 10}
        />
      ))}

      {!isLoading && shows.length === 0 && (
        <div className="col-span-full flex h-64 items-center justify-center text-muted-foreground">
          {t("noEpisodes")}
        </div>
      )}
    </div>
  );
}

// ─── Glass sort dropdown — moved from the TV home (tv/page.tsx) ───

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

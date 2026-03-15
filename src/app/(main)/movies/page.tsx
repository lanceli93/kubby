"use client";

import { Suspense, useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { MovieCard } from "@/components/movie/movie-card";
import { PersonCard } from "@/components/people/person-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "next-intl";
import {
  ArrowDownAZ,
  CalendarPlus,
  Calendar,
  Star,
  Timer,
  ArrowUpDown,
  Filter,
  ChevronDown,
  ChevronRight,
  X,
  Hash,
  UserRound,
  Loader2,
  Cake,
  Monitor,
  HardDrive,
} from "lucide-react";
import { useUserPreferences } from "@/hooks/use-user-preferences";

interface Movie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  posterBlur?: string | null;
  communityRating?: number | null;
  personalRating?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  isFavorite?: boolean;
  isWatched?: boolean;
  genres?: string[];
  tags?: string[];
  ageAtRelease?: number | null;
}

interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

interface FiltersData {
  genres: string[];
  tags: string[];
  years: number[];
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
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles?: boolean }) =>
      fetch(`/api/movies/${id}${deleteFiles ? "?deleteFiles=true" : ""}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movies"] });
    },
  });

  return {
    handleToggleFavorite: (id: string, current: boolean) =>
      toggleFavorite.mutate({ id, current }),
    handleToggleWatched: (id: string, current: boolean) =>
      toggleWatched.mutate({ id, current }),
    handleDeleteMovie: (id: string, deleteFiles?: boolean) =>
      deleteMovie.mutate({ id, deleteFiles }),
  };
}

function MovieBrowseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const libraryId = searchParams.get("libraryId") || "";
  const personId = searchParams.get("personId") || "";
  const t = useTranslations("movies");

  // Derive active tab: if URL has genre/tag/studio filter, force "movies" tab
  const urlHasFilter = searchParams.get("genre") || searchParams.get("tag") || searchParams.get("studio");
  const [activeTab, setActiveTab] = useState(() =>
    urlHasFilter ? "movies" : (searchParams.get("tab") || "movies")
  );

  // Switch to "movies" tab when filter params appear in URL
  useEffect(() => {
    if (urlHasFilter) setActiveTab("movies");
  }, [urlHasFilter]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab !== "movies") params.set("tab", tab);
    else params.delete("tab");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname]);

  // Person filmography mode — no tabs, just a movie grid
  if (personId) {
    return (
      <div className="h-full overflow-y-scroll px-4 md:px-12">
          <PersonMoviesContent personId={personId} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex h-full flex-col">
        <div className="flex justify-center border-b border-white/[0.06] bg-[var(--header)]">
          <TabsList variant="line">
            <TabsTrigger value="movies" className="transition-fluid cursor-pointer">{t("movies")}</TabsTrigger>
            <TabsTrigger value="favorites" className="transition-fluid cursor-pointer">{t("favorites")}</TabsTrigger>
            <TabsTrigger value="genres" className="transition-fluid cursor-pointer">{t("genres")}</TabsTrigger>
            <TabsTrigger value="actors" className="transition-fluid cursor-pointer">{t("actors")}</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-scroll px-4 md:px-12">
          <TabsContent value="movies">
            <MoviesTabContent libraryId={libraryId} />
          </TabsContent>

          <TabsContent value="favorites">
            <FavoritesTabContent libraryId={libraryId} />
          </TabsContent>

          <TabsContent value="genres">
            <GenresTabContent libraryId={libraryId} />
          </TabsContent>

          <TabsContent value="actors">
            <ActorsTabContent libraryId={libraryId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function MoviesTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("movies");
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
  const [sortDimension, setSortDimension] = useState<string | null>(() =>
    searchParams.get("sortDimension") || null
  );
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [personalRatingExpanded, setPersonalRatingExpanded] = useState(false);
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

  // Sync sort/filter state to URL params for persistence across navigation
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    // Sort
    if (sort !== "dateAdded") params.set("sort", sort);
    else params.delete("sort");
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    else params.delete("sortOrder");
    if (sortDimension) params.set("sortDimension", sortDimension);
    else params.delete("sortDimension");
    // Filters
    if (selectedGenres.length > 0) params.set("genres", selectedGenres.join(","));
    else params.delete("genres");
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
    else params.delete("tags");
    if (selectedYears.length > 0) params.set("years", selectedYears.join(","));
    else params.delete("years");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [sort, sortOrder, sortDimension, selectedGenres, selectedTags, selectedYears, router, pathname]);
  const sortRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const { handleToggleFavorite, handleToggleWatched, handleDeleteMovie } =
    useMovieMutations();
  const { data: prefs } = useUserPreferences();
  const movieDimensions = prefs?.movieRatingDimensions ?? [];

  const sortOptions = [
    { value: "title", label: t("titleAZ"), icon: ArrowDownAZ },
    { value: "rating", label: t("rating"), icon: Star },
    { value: "personalRating", label: t("personalRating"), icon: UserRound },
    { value: "dateAdded", label: t("dateAdded"), icon: CalendarPlus },
    { value: "releaseDate", label: t("releaseDate"), icon: Calendar },
    { value: "runtime", label: t("runtime"), icon: Timer },
    { value: "resolution", label: t("resolution"), icon: Monitor },
    { value: "fileSize", label: t("fileSize"), icon: HardDrive },
  ];

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch available filters
  const { data: filters } = useQuery<FiltersData>({
    queryKey: ["filters", libraryId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      return fetch(`/api/filters?${params}`).then((r) => r.json());
    },
  });

  const {
    data: moviesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingMovies,
  } = useInfiniteQuery<PaginatedResponse<Movie>>({
    queryKey: ["movies", { libraryId, sort, sortOrder, sortDimension, selectedGenres, selectedTags, selectedYears, urlTag, urlStudio }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      params.set("sort", sort);
      params.set("sortOrder", sortOrder);
      params.set("offset", String(pageParam));
      if (sortDimension) params.set("sortDimension", sortDimension);
      if (selectedGenres.length > 0) params.set("genres", selectedGenres.join(","));
      if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
      if (selectedYears.length > 0) params.set("years", selectedYears.join(","));
      if (urlTag && selectedTags.length === 0) params.set("tag", urlTag);
      if (urlStudio) params.set("studio", urlStudio);
      return fetch(`/api/movies?${params}`).then((r) => r.json());
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
  });

  const movies = moviesData?.pages.flatMap((p) => p.items) ?? [];
  const totalCount = moviesData?.pages[0]?.totalCount ?? 0;
  const { sentinelRef: moviesSentinelRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  const activeFilterCount = selectedGenres.length + selectedTags.length + selectedYears.length;

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
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
    <div
      className="animate-fade-in-up grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,180px)] md:gap-x-4 md:gap-y-4 justify-center"
    >
      {/* Sort & Filter Toolbar — spans full grid width, count aligns with first card */}
      <div className="col-span-full py-[18px] flex items-center gap-6">
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {t("moviesCount", { count: totalCount || movies.length })}
        </span>
        <div className="flex flex-1 items-center justify-center gap-6">
        {/* Sort button */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => {
              setShowSortDropdown(!showSortDropdown);
              setShowFilterDropdown(false);
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground transition-fluid hover:text-foreground cursor-pointer"
          >
            <ArrowUpDown className="h-5 w-5" />
            {t("sortBy")}
          </button>

          {showSortDropdown && (
            <div className="absolute left-1/2 top-full z-50 mt-1 w-[220px] -translate-x-1/2 rounded-[10px] border border-white/10 bg-black/70 backdrop-blur-xl py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.63)]">
              {sortOptions.map((option) => {
                const Icon = option.icon;
                const isActive = sort === option.value && !sortDimension;
                const hasDimensions = option.value === "personalRating" && movieDimensions.length > 0;
                const isGroupActive = option.value === "personalRating" && sort === "personalRating";

                if (hasDimensions) {
                  return (
                    <div key={option.value}>
                      <button
                        onClick={() => setPersonalRatingExpanded(!personalRatingExpanded)}
                        className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                          isGroupActive
                            ? "bg-primary/[0.08] text-foreground"
                            : "text-[#d0d0e0] hover:bg-white/[0.04]"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${
                            isGroupActive ? "text-primary" : "text-[#666680]"
                          }`}
                        />
                        {option.label}
                        <span className="ml-auto">
                          {personalRatingExpanded ? (
                            <ChevronDown className="h-3 w-3 text-[#666680]" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-[#666680]" />
                          )}
                        </span>
                      </button>
                      {personalRatingExpanded && (
                        <>
                          <button
                            onClick={() => {
                              setSort("personalRating");
                              setSortDimension(null);
                              setSortOrder("desc");
                            }}
                            className={`flex h-[34px] w-full items-center gap-2.5 pl-10 pr-4 text-[13px] transition-colors ${
                              sort === "personalRating" && !sortDimension
                                ? "bg-primary/[0.08] text-foreground"
                                : "text-[#d0d0e0] hover:bg-white/[0.04]"
                            }`}
                          >
                            {t("overall")}
                          </button>
                          {movieDimensions.map((dim) => (
                            <button
                              key={dim}
                              onClick={() => {
                                setSort("personalRating");
                                setSortDimension(dim);
                                setSortOrder("desc");
                              }}
                              className={`flex h-[34px] w-full items-center gap-2.5 pl-10 pr-4 text-[13px] transition-colors ${
                                sort === "personalRating" && sortDimension === dim
                                  ? "bg-primary/[0.08] text-foreground"
                                  : "text-[#d0d0e0] hover:bg-white/[0.04]"
                              }`}
                            >
                              {dim}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  );
                }

                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSort(option.value);
                      setSortDimension(null);
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
              <div className="my-1.5 border-t border-white/[0.06]" />
              <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {t("sortOrder")}
              </p>
              <button
                onClick={() => setSortOrder("asc")}
                className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                  sortOrder === "asc"
                    ? "bg-primary/[0.08] text-foreground"
                    : "text-[#d0d0e0] hover:bg-white/[0.04]"
                }`}
              >
                <span className={`h-3 w-3 rounded-full border-2 ${sortOrder === "asc" ? "border-primary bg-primary" : "border-[#666680]"}`} />
                {t("ascending")}
              </button>
              <button
                onClick={() => setSortOrder("desc")}
                className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                  sortOrder === "desc"
                    ? "bg-primary/[0.08] text-foreground"
                    : "text-[#d0d0e0] hover:bg-white/[0.04]"
                }`}
              >
                <span className={`h-3 w-3 rounded-full border-2 ${sortOrder === "desc" ? "border-primary bg-primary" : "border-[#666680]"}`} />
                {t("descending")}
              </button>
            </div>
          )}
        </div>

        {/* Filter button */}
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => {
              setShowFilterDropdown(!showFilterDropdown);
              setShowSortDropdown(false);
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground transition-fluid hover:text-foreground cursor-pointer"
          >
            <Filter className="h-5 w-5" />
            {t("filter")}
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>

          {showFilterDropdown && (
            <div className="absolute left-1/2 top-full z-50 mt-1 w-[260px] max-h-[400px] -translate-x-1/2 overflow-y-auto rounded-[10px] border border-white/10 bg-black/70 backdrop-blur-xl py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.63)]">
              {/* Clear all */}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex w-full items-center gap-2 px-4 py-2 text-[13px] text-red-400 transition-colors hover:bg-white/[0.04]"
                >
                  <X className="h-3.5 w-3.5" />
                  {t("clearFilters")}
                </button>
              )}

              {/* Genres section */}
              {filters && filters.genres.length > 0 && (
                <>
                  <button
                    onClick={() => setGenresExpanded(!genresExpanded)}
                    className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    {genresExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {t("genres")}
                  </button>
                  {genresExpanded &&
                    filters.genres.map((genre) => {
                      const checked = selectedGenres.includes(genre);
                      return (
                        <button
                          key={genre}
                          onClick={() => toggleGenre(genre)}
                          className={`flex h-[34px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                            checked
                              ? "text-foreground"
                              : "text-[#d0d0e0] hover:bg-white/[0.04]"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              checked
                                ? "border-primary bg-primary text-white"
                                : "border-[#666680]"
                            }`}
                          >
                            {checked && (
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
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
                    {yearsExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {t("year")}
                  </button>
                  {yearsExpanded &&
                    filters.years.map((year) => {
                      const checked = selectedYears.includes(year);
                      return (
                        <button
                          key={year}
                          onClick={() => toggleYear(year)}
                          className={`flex h-[34px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                            checked
                              ? "text-foreground"
                              : "text-[#d0d0e0] hover:bg-white/[0.04]"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              checked
                                ? "border-primary bg-primary text-white"
                                : "border-[#666680]"
                            }`}
                          >
                            {checked && (
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
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
                    {tagsExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {t("tags")}
                  </button>
                  {tagsExpanded &&
                    filters.tags.map((tag) => {
                      const checked = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`flex h-[34px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                            checked
                              ? "text-foreground"
                              : "text-[#d0d0e0] hover:bg-white/[0.04]"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              checked
                                ? "border-primary bg-primary text-white"
                                : "border-[#666680]"
                            }`}
                          >
                            {checked && (
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
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
        </div>
      </div>

      {/* Movie cards */}
        {movies.map((movie) => (
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
            isFavorite={movie.isFavorite}
            isWatched={movie.isWatched}
            responsive
            onToggleFavorite={() =>
              handleToggleFavorite(movie.id, !!movie.isFavorite)
            }
            onToggleWatched={() =>
              handleToggleWatched(movie.id, !!movie.isWatched)
            }
            onDelete={(deleteFiles) => handleDeleteMovie(movie.id, deleteFiles)}
          />
        ))}

      {/* Infinite scroll sentinel */}
      <div ref={moviesSentinelRef} className="col-span-full" style={{ height: 1 }} />
      {isFetchingNextPage && (
        <div className="col-span-full flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoadingMovies && movies.length === 0 && (
        <div className="col-span-full flex h-64 items-center justify-center text-muted-foreground">
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

  const {
    data: favData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedResponse<Movie>>({
    queryKey: ["movies", "favorites", libraryId],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("filter", "favorites");
      if (libraryId) params.set("libraryId", libraryId);
      params.set("offset", String(pageParam));
      return fetch(`/api/movies?${params}`).then((r) => r.json());
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
  });

  const favorites = favData?.pages.flatMap((p) => p.items) ?? [];
  const { sentinelRef } = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  return (
    <div className="animate-fade-in-up py-6">
      {favorites.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,180px)] md:gap-4 justify-center">
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
              isFavorite
              isWatched={movie.isWatched}
              responsive
              onToggleFavorite={() =>
                handleToggleFavorite(movie.id, true)
              }
              onToggleWatched={() =>
                handleToggleWatched(movie.id, !!movie.isWatched)
              }
              onDelete={(deleteFiles) => handleDeleteMovie(movie.id, deleteFiles)}
            />
          ))}
        </div>
      ) : (
        !isLoading && (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            {t("noFavorites")}
          </div>
        )
      )}

      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

const GENRES_PER_PAGE = 8;

function GenresTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("movies");
  const [visibleCount, setVisibleCount] = useState(GENRES_PER_PAGE);

  const { data: filters } = useQuery<FiltersData>({
    queryKey: ["filters", libraryId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      return fetch(`/api/filters?${params}`).then((r) => r.json());
    },
  });

  const genres = filters?.genres ?? [];
  const visibleGenres = genres.slice(0, visibleCount);
  const hasMore = visibleCount < genres.length;

  const { sentinelRef } = useInfiniteScroll({
    hasNextPage: hasMore,
    isFetchingNextPage: false,
    fetchNextPage: () => setVisibleCount((c) => c + GENRES_PER_PAGE),
  });

  if (filters && genres.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center pt-4 text-muted-foreground">
        {t("noMovies")}
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
  const { handleToggleFavorite, handleToggleWatched, handleDeleteMovie } =
    useMovieMutations();

  const { data: movies = [] } = useQuery<Movie[]>({
    queryKey: ["movies", "genre-row", libraryId, genre],
    queryFn: () => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      params.set("genre", genre);
      params.set("limit", "50");
      return fetch(`/api/movies?${params}`).then((r) => r.json());
    },
  });

  const genreHref = libraryId
    ? `/movies?libraryId=${libraryId}&genre=${encodeURIComponent(genre)}`
    : `/movies?genre=${encodeURIComponent(genre)}`;

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
        {movies.map((movie) => (
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
            isFavorite={movie.isFavorite}
            isWatched={movie.isWatched}
            onToggleFavorite={() =>
              handleToggleFavorite(movie.id, !!movie.isFavorite)
            }
            onToggleWatched={() =>
              handleToggleWatched(movie.id, !!movie.isWatched)
            }
            onDelete={(deleteFiles) => handleDeleteMovie(movie.id, deleteFiles)}
          />
        ))}
      </ScrollRow>
    </section>
  );
}

interface PersonItem {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
  photoBlur?: string | null;
  personalRating?: number | null;
  movieCount: number;
  tags?: string[];
  dateAdded?: string;
}

interface PeopleFiltersData {
  types: string[];
  tags: string[];
}

const TIERS = ["SSS", "SS", "S", "A", "B", "C", "D", "E"] as const;

function usePersonMutations() {
  const queryClient = useQueryClient();

  const deletePerson = useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles?: boolean }) =>
      fetch(`/api/people/${id}${deleteFiles ? "?deleteFiles=true" : ""}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["movies"] });
    },
  });

  return {
    handleDeletePerson: (id: string, deleteFiles?: boolean) =>
      deletePerson.mutate({ id, deleteFiles }),
  };
}

function ActorsTabContent({ libraryId }: { libraryId: string }) {
  const t = useTranslations("movies");
  const [sort, setSort] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortDimension, setSortDimension] = useState<string | null>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [personalRatingExpanded, setPersonalRatingExpanded] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTiers, setSelectedTiers] = useState<string[]>([]);
  const [typesExpanded, setTypesExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [tiersExpanded, setTiersExpanded] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const { data: prefs } = useUserPreferences();
  const personDimensions = prefs?.personRatingDimensions ?? [];
  const { handleDeletePerson } = usePersonMutations();

  const sortOptions = [
    { value: "name", label: t("nameAZ"), icon: ArrowDownAZ },
    { value: "personalRating", label: t("personalRating"), icon: Star },
    { value: "dateAdded", label: t("dateAdded"), icon: CalendarPlus },
    { value: "movieCount", label: t("movieCount"), icon: Hash },
  ];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: filters } = useQuery<PeopleFiltersData>({
    queryKey: ["people-filters", libraryId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      return fetch(`/api/people-filters?${params}`).then((r) => r.json());
    },
  });

  const {
    data: actorsData,
    fetchNextPage: fetchNextActors,
    hasNextPage: hasNextActors,
    isFetchingNextPage: isFetchingNextActors,
    isLoading: isLoadingActors,
  } = useInfiniteQuery<PaginatedResponse<PersonItem>>({
    queryKey: ["people", { libraryId, sort, sortOrder, sortDimension, selectedTypes, selectedTags, selectedTiers }],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      params.set("sort", sort);
      params.set("sortOrder", sortOrder);
      params.set("offset", String(pageParam));
      if (sortDimension) params.set("sortDimension", sortDimension);
      if (selectedTypes.length > 0) params.set("types", selectedTypes.join(","));
      if (selectedTags.length > 0) params.set("tags", selectedTags.join(","));
      if (selectedTiers.length > 0) params.set("tier", selectedTiers.join(","));
      return fetch(`/api/people?${params}`).then((r) => r.json());
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.offset + lastPage.limit : undefined,
  });

  const actors = actorsData?.pages.flatMap((p) => p.items) ?? [];
  const actorsTotalCount = actorsData?.pages[0]?.totalCount ?? 0;
  const { sentinelRef: actorsSentinelRef } = useInfiniteScroll({
    hasNextPage: hasNextActors,
    isFetchingNextPage: isFetchingNextActors,
    fetchNextPage: fetchNextActors,
  });

  const activeFilterCount = selectedTypes.length + selectedTags.length + selectedTiers.length;

  const toggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleTier = (tier: string) => {
    setSelectedTiers((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  };

  const clearFilters = () => {
    setSelectedTypes([]);
    setSelectedTags([]);
    setSelectedTiers([]);
  };

  return (
    <div
      className="animate-fade-in-up grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,180px)] md:gap-x-4 md:gap-y-4 justify-center"
    >
      {/* Sort & Filter Toolbar — spans full grid width, count aligns with first card */}
      <div className="col-span-full py-[18px] flex items-center gap-6">
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {t("actorsCount", { count: actorsTotalCount || actors.length })}
        </span>
        <div className="flex flex-1 items-center justify-center gap-6">
        {/* Sort button */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => {
              setShowSortDropdown(!showSortDropdown);
              setShowFilterDropdown(false);
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground transition-fluid hover:text-foreground cursor-pointer"
          >
            <ArrowUpDown className="h-5 w-5" />
            {t("sortBy")}
          </button>

          {showSortDropdown && (
            <div className="absolute left-1/2 top-full z-50 mt-1 w-[220px] -translate-x-1/2 rounded-[10px] border border-white/10 bg-black/70 backdrop-blur-xl py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.63)]">
              {sortOptions.map((option) => {
                const Icon = option.icon;
                const isActive = sort === option.value && !sortDimension;
                const hasDimensions = option.value === "personalRating" && personDimensions.length > 0;
                const isGroupActive = option.value === "personalRating" && sort === "personalRating";

                if (hasDimensions) {
                  return (
                    <div key={option.value}>
                      <button
                        onClick={() => setPersonalRatingExpanded(!personalRatingExpanded)}
                        className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                          isGroupActive
                            ? "bg-primary/[0.08] text-foreground"
                            : "text-[#d0d0e0] hover:bg-white/[0.04]"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${
                            isGroupActive ? "text-primary" : "text-[#666680]"
                          }`}
                        />
                        {option.label}
                        <span className="ml-auto">
                          {personalRatingExpanded ? (
                            <ChevronDown className="h-3 w-3 text-[#666680]" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-[#666680]" />
                          )}
                        </span>
                      </button>
                      {personalRatingExpanded && (
                        <>
                          <button
                            onClick={() => {
                              setSort("personalRating");
                              setSortDimension(null);
                              setSortOrder("desc");
                            }}
                            className={`flex h-[34px] w-full items-center gap-2.5 pl-10 pr-4 text-[13px] transition-colors ${
                              sort === "personalRating" && !sortDimension
                                ? "bg-primary/[0.08] text-foreground"
                                : "text-[#d0d0e0] hover:bg-white/[0.04]"
                            }`}
                          >
                            {t("overall")}
                          </button>
                          {personDimensions.map((dim) => (
                            <button
                              key={dim}
                              onClick={() => {
                                setSort("personalRating");
                                setSortDimension(dim);
                                setSortOrder("desc");
                              }}
                              className={`flex h-[34px] w-full items-center gap-2.5 pl-10 pr-4 text-[13px] transition-colors ${
                                sort === "personalRating" && sortDimension === dim
                                  ? "bg-primary/[0.08] text-foreground"
                                  : "text-[#d0d0e0] hover:bg-white/[0.04]"
                              }`}
                            >
                              {dim}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  );
                }

                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSort(option.value);
                      setSortDimension(null);
                      setSortOrder(option.value === "name" ? "asc" : "desc");
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
              <div className="my-1.5 border-t border-white/[0.06]" />
              <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {t("sortOrder")}
              </p>
              <button
                onClick={() => setSortOrder("asc")}
                className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                  sortOrder === "asc"
                    ? "bg-primary/[0.08] text-foreground"
                    : "text-[#d0d0e0] hover:bg-white/[0.04]"
                }`}
              >
                <span className={`h-3 w-3 rounded-full border-2 ${sortOrder === "asc" ? "border-primary bg-primary" : "border-[#666680]"}`} />
                {t("ascending")}
              </button>
              <button
                onClick={() => setSortOrder("desc")}
                className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                  sortOrder === "desc"
                    ? "bg-primary/[0.08] text-foreground"
                    : "text-[#d0d0e0] hover:bg-white/[0.04]"
                }`}
              >
                <span className={`h-3 w-3 rounded-full border-2 ${sortOrder === "desc" ? "border-primary bg-primary" : "border-[#666680]"}`} />
                {t("descending")}
              </button>
            </div>
          )}
        </div>

        {/* Filter button */}
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => {
              setShowFilterDropdown(!showFilterDropdown);
              setShowSortDropdown(false);
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground transition-fluid hover:text-foreground cursor-pointer"
          >
            <Filter className="h-5 w-5" />
            {t("filter")}
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>

          {showFilterDropdown && (
            <div className="absolute left-1/2 top-full z-50 mt-1 w-[260px] max-h-[400px] -translate-x-1/2 overflow-y-auto rounded-[10px] border border-white/10 bg-black/70 backdrop-blur-xl py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.63)]">
              {/* Clear all */}
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex w-full items-center gap-2 px-4 py-2 text-[13px] text-red-400 transition-colors hover:bg-white/[0.04]"
                >
                  <X className="h-3.5 w-3.5" />
                  {t("clearFilters")}
                </button>
              )}

              {/* Types section */}
              {filters && filters.types.length > 0 && (
                <>
                  <button
                    onClick={() => setTypesExpanded(!typesExpanded)}
                    className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    {typesExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {t("type")}
                  </button>
                  {typesExpanded &&
                    filters.types.map((type) => {
                      const checked = selectedTypes.includes(type);
                      return (
                        <button
                          key={type}
                          onClick={() => toggleType(type)}
                          className={`flex h-[34px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                            checked
                              ? "text-foreground"
                              : "text-[#d0d0e0] hover:bg-white/[0.04]"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              checked
                                ? "border-primary bg-primary text-white"
                                : "border-[#666680]"
                            }`}
                          >
                            {checked && (
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          {type}
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
                    {tagsExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    {t("tags")}
                  </button>
                  {tagsExpanded &&
                    filters.tags.map((tag) => {
                      const checked = selectedTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={`flex h-[34px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                            checked
                              ? "text-foreground"
                              : "text-[#d0d0e0] hover:bg-white/[0.04]"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              checked
                                ? "border-primary bg-primary text-white"
                                : "border-[#666680]"
                            }`}
                          >
                            {checked && (
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          {tag}
                        </button>
                      );
                    })}
                </>
              )}

              {/* Tier section */}
              <>
                <div className="my-1.5 border-t border-white/[0.06]" />
                <button
                  onClick={() => setTiersExpanded(!tiersExpanded)}
                  className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground"
                >
                  {tiersExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {t("tier")}
                </button>
                {tiersExpanded && (
                  <>
                    {TIERS.map((tier) => {
                      const checked = selectedTiers.includes(tier);
                      return (
                        <button
                          key={tier}
                          onClick={() => toggleTier(tier)}
                          className={`flex h-[34px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                            checked
                              ? "text-foreground"
                              : "text-[#d0d0e0] hover:bg-white/[0.04]"
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              checked
                                ? "border-primary bg-primary text-white"
                                : "border-[#666680]"
                            }`}
                          >
                            {checked && (
                              <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          {tier}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => toggleTier("unrated")}
                      className={`flex h-[34px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                        selectedTiers.includes("unrated")
                          ? "text-foreground"
                          : "text-[#d0d0e0] hover:bg-white/[0.04]"
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          selectedTiers.includes("unrated")
                            ? "border-primary bg-primary text-white"
                            : "border-[#666680]"
                        }`}
                      >
                        {selectedTiers.includes("unrated") && (
                          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      {t("unrated")}
                    </button>
                  </>
                )}
              </>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Actor cards */}
        {actors.map((person) => (
          <PersonCard
            key={person.id}
            id={person.id}
            name={person.name}
            role={`${person.movieCount} ${person.movieCount === 1 ? "movie" : "movies"}`}
            photoPath={person.photoPath}
            photoBlur={person.photoBlur}
            personalRating={person.personalRating}
            size="movie"
            onDelete={(deleteFiles) => handleDeletePerson(person.id, deleteFiles)}
          />
        ))}

      {/* Infinite scroll sentinel */}
      <div ref={actorsSentinelRef} className="col-span-full" style={{ height: 1 }} />
      {isFetchingNextActors && (
        <div className="col-span-full flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoadingActors && actors.length === 0 && (
        <div className="col-span-full flex h-64 items-center justify-center text-muted-foreground">
          {t("noActors")}
        </div>
      )}
    </div>
  );
}

function PersonMoviesContent({ personId }: { personId: string }) {
  const t = useTranslations("movies");
  const tPerson = useTranslations("person");
  const [sort, setSort] = useState("releaseDate");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sortDimension, setSortDimension] = useState<string | null>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [personalRatingExpanded, setPersonalRatingExpanded] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [genresExpanded, setGenresExpanded] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [yearsExpanded, setYearsExpanded] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const { handleToggleFavorite, handleToggleWatched, handleDeleteMovie } =
    useMovieMutations();
  const { data: prefs } = useUserPreferences();
  const movieDimensions = prefs?.movieRatingDimensions ?? [];

  const sortOptions = [
    { value: "title", label: t("titleAZ"), icon: ArrowDownAZ },
    { value: "rating", label: t("rating"), icon: Star },
    { value: "personalRating", label: t("personalRating"), icon: UserRound },
    { value: "dateAdded", label: t("dateAdded"), icon: CalendarPlus },
    { value: "releaseDate", label: t("releaseDate"), icon: Calendar },
    { value: "runtime", label: t("runtime"), icon: Timer },
    { value: "resolution", label: t("resolution"), icon: Monitor },
    { value: "fileSize", label: t("fileSize"), icon: HardDrive },
    { value: "ageAtRelease", label: t("ageAtRelease"), icon: Cake },
  ];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: allMovies = [] } = useQuery<Movie[]>({
    queryKey: ["movies", { personId, sort, sortOrder, sortDimension }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("personId", personId);
      params.set("sort", sort);
      params.set("sortOrder", sortOrder);
      params.set("includeGenres", "true");
      params.set("limit", "500");
      if (sortDimension) params.set("sortDimension", sortDimension);
      return fetch(`/api/movies?${params}`).then((r) => r.json());
    },
  });

  // Compute filter options from loaded movies
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMovies) {
      if (m.genres && Array.isArray(m.genres)) m.genres.forEach((g) => set.add(g));
    }
    return Array.from(set).sort();
  }, [allMovies]);

  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMovies) {
      if (m.tags && Array.isArray(m.tags)) m.tags.forEach((t) => set.add(t));
    }
    return Array.from(set).sort();
  }, [allMovies]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    for (const m of allMovies) {
      if (m.year) set.add(m.year);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [allMovies]);

  // Client-side filtering
  const movies = useMemo(() => {
    return allMovies.filter((m) => {
      if (selectedGenres.length > 0) {
        if (!m.genres || !Array.isArray(m.genres) || !selectedGenres.some((g) => m.genres!.includes(g))) return false;
      }
      if (selectedTags.length > 0) {
        if (!m.tags || !Array.isArray(m.tags) || !selectedTags.some((t) => m.tags!.includes(t))) return false;
      }
      if (selectedYears.length > 0) {
        if (!m.year || !selectedYears.includes(m.year)) return false;
      }
      return true;
    });
  }, [allMovies, selectedGenres, selectedTags, selectedYears]);

  const activeFilterCount = selectedGenres.length + selectedTags.length + selectedYears.length;

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
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
    <div
      className="animate-fade-in-up grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,180px)] md:gap-x-4 md:gap-y-4 justify-center"
    >
      {/* Sort & Filter Toolbar */}
      <div className="col-span-full py-[18px] flex items-center gap-6">
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {t("moviesCount", { count: movies.length })}
        </span>
        <div className="flex flex-1 items-center justify-center gap-6">
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => {
              setShowSortDropdown(!showSortDropdown);
              setShowFilterDropdown(false);
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground transition-fluid hover:text-foreground cursor-pointer"
          >
            <ArrowUpDown className="h-5 w-5" />
            {t("sortBy")}
          </button>

          {showSortDropdown && (
            <div className="absolute left-1/2 top-full z-50 mt-1 w-[220px] -translate-x-1/2 rounded-[10px] border border-white/10 bg-black/70 backdrop-blur-xl py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.63)]">
              {sortOptions.map((option) => {
                const Icon = option.icon;
                const isActive = sort === option.value && !sortDimension;
                const hasDimensions = option.value === "personalRating" && movieDimensions.length > 0;
                const isGroupActive = option.value === "personalRating" && sort === "personalRating";

                if (hasDimensions) {
                  return (
                    <div key={option.value}>
                      <button
                        onClick={() => setPersonalRatingExpanded(!personalRatingExpanded)}
                        className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                          isGroupActive
                            ? "bg-primary/[0.08] text-foreground"
                            : "text-[#d0d0e0] hover:bg-white/[0.04]"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 ${
                            isGroupActive ? "text-primary" : "text-[#666680]"
                          }`}
                        />
                        {option.label}
                        <span className="ml-auto">
                          {personalRatingExpanded ? (
                            <ChevronDown className="h-3 w-3 text-[#666680]" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-[#666680]" />
                          )}
                        </span>
                      </button>
                      {personalRatingExpanded && (
                        <>
                          <button
                            onClick={() => {
                              setSort("personalRating");
                              setSortDimension(null);
                              setSortOrder("desc");
                            }}
                            className={`flex h-[34px] w-full items-center gap-2.5 pl-10 pr-4 text-[13px] transition-colors ${
                              sort === "personalRating" && !sortDimension
                                ? "bg-primary/[0.08] text-foreground"
                                : "text-[#d0d0e0] hover:bg-white/[0.04]"
                            }`}
                          >
                            {t("overall")}
                          </button>
                          {movieDimensions.map((dim) => (
                            <button
                              key={dim}
                              onClick={() => {
                                setSort("personalRating");
                                setSortDimension(dim);
                                setSortOrder("desc");
                              }}
                              className={`flex h-[34px] w-full items-center gap-2.5 pl-10 pr-4 text-[13px] transition-colors ${
                                sort === "personalRating" && sortDimension === dim
                                  ? "bg-primary/[0.08] text-foreground"
                                  : "text-[#d0d0e0] hover:bg-white/[0.04]"
                              }`}
                            >
                              {dim}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  );
                }

                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSort(option.value);
                      setSortDimension(null);
                    }}
                    className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
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
                {t("sortOrder")}
              </p>
              <button
                onClick={() => setSortOrder("asc")}
                className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                  sortOrder === "asc" ? "bg-primary/[0.08] text-foreground" : "text-[#d0d0e0] hover:bg-white/[0.04]"
                }`}
              >
                <span className={`h-3 w-3 rounded-full border-2 ${sortOrder === "asc" ? "border-primary bg-primary" : "border-[#666680]"}`} />
                {t("ascending")}
              </button>
              <button
                onClick={() => setSortOrder("desc")}
                className={`flex h-[38px] w-full items-center gap-2.5 px-4 text-[13px] transition-colors ${
                  sortOrder === "desc" ? "bg-primary/[0.08] text-foreground" : "text-[#d0d0e0] hover:bg-white/[0.04]"
                }`}
              >
                <span className={`h-3 w-3 rounded-full border-2 ${sortOrder === "desc" ? "border-primary bg-primary" : "border-[#666680]"}`} />
                {t("descending")}
              </button>
            </div>
          )}
        </div>

        <div className="relative" ref={filterRef}>
          <button
            onClick={() => {
              setShowFilterDropdown(!showFilterDropdown);
              setShowSortDropdown(false);
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground transition-fluid hover:text-foreground cursor-pointer"
          >
            <Filter className="h-5 w-5" />
            {t("filter")}
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>

          {showFilterDropdown && (
            <div className="absolute left-1/2 top-full z-50 mt-1 w-[260px] max-h-[400px] -translate-x-1/2 overflow-y-auto rounded-[10px] border border-white/10 bg-black/70 backdrop-blur-xl py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.63)]">
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex w-full items-center gap-2 px-4 py-2 text-[13px] text-red-400 transition-colors hover:bg-white/[0.04]"
                >
                  <X className="h-3.5 w-3.5" />
                  {t("clearFilters")}
                </button>
              )}

              {availableGenres.length > 0 && (
                <>
                  <button
                    onClick={() => setGenresExpanded(!genresExpanded)}
                    className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    {genresExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {t("genres")}
                  </button>
                  {genresExpanded &&
                    availableGenres.map((genre) => {
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

              {availableYears.length > 0 && (
                <>
                  <div className="my-1.5 border-t border-white/[0.06]" />
                  <button
                    onClick={() => setYearsExpanded(!yearsExpanded)}
                    className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    {yearsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {t("year")}
                  </button>
                  {yearsExpanded &&
                    availableYears.map((year) => {
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

              {availableTags.length > 0 && (
                <>
                  <div className="my-1.5 border-t border-white/[0.06]" />
                  <button
                    onClick={() => setTagsExpanded(!tagsExpanded)}
                    className="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    {tagsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {t("tags")}
                  </button>
                  {tagsExpanded &&
                    availableTags.map((tag) => {
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
        </div>
      </div>

      {/* Movie Cards — direct grid children */}
      {movies.map((movie) => (
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
          isFavorite={movie.isFavorite}
          isWatched={movie.isWatched}
          responsive
          subtitle={movie.ageAtRelease != null ? tPerson("filmedAtAge", { age: movie.ageAtRelease }) : undefined}
          onToggleFavorite={() =>
            handleToggleFavorite(movie.id, !!movie.isFavorite)
          }
          onToggleWatched={() =>
            handleToggleWatched(movie.id, !!movie.isWatched)
          }
          onDelete={(deleteFiles) => handleDeleteMovie(movie.id, deleteFiles)}
        />
      ))}

      {movies.length === 0 && (
        <div className="col-span-full flex h-64 items-center justify-center text-muted-foreground">
          {t("noMovies")}
        </div>
      )}
    </div>
  );
}

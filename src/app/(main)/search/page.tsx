"use client";

import { Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Tag, ChevronRight, Loader2, ChevronDown, Library, Check } from "lucide-react";
import { MovieCard } from "@/components/movie/movie-card";
import { PersonCard } from "@/components/people/person-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import {
  BookmarkSearchCard,
  type BookmarkSearchResult,
} from "@/components/search/bookmark-search-card";
import { useTranslations } from "next-intl";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// ── Types ───────────────────────────────────────────────────────
interface Movie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  communityRating?: number | null;
  personalRating?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
}

interface Person {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
  personalRating?: number | null;
  movieCount?: number;
}

interface GenreResult {
  name: string;
  movieCount: number;
  previewMovies: { id: string; title: string; posterPath?: string | null; year?: number | null; communityRating?: number | null; personalRating?: number | null; videoWidth?: number | null; videoHeight?: number | null }[];
}

interface SearchResults {
  movies: { items: Movie[]; totalCount: number };
  genres: { items: GenreResult[]; totalCount: number };
  tags: { items: GenreResult[]; totalCount: number };
  people: { items: Person[]; totalCount: number };
  bookmarks: { items: BookmarkSearchResult[]; totalCount: number };
}

interface Library {
  id: string;
  name: string;
}

type Category = "all" | "movies" | "genres" | "tags" | "people" | "bookmarks";

// ── Hooks ───────────────────────────────────────────────────────
function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── Main page ───────────────────────────────────────────────────
export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const initialCategory = (searchParams.get("category") as Category) || "all";
  const initialLibraryId = searchParams.get("libraryId") || "";

  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<Category>(initialCategory);
  const [libraryId, setLibraryId] = useState(initialLibraryId);
  const debouncedQuery = useDebounce(query, 300);
  const t = useTranslations("search");

  // External player
  const { data: prefs } = useUserPreferences();
  const SUPPORTED_PLAYERS = ["IINA", "PotPlayer"];
  const externalPlayerName = SUPPORTED_PLAYERS.includes(prefs?.externalPlayerName || "") ? prefs!.externalPlayerName : null;
  const externalEnabled = !!(prefs?.externalPlayerEnabled && externalPlayerName);
  const isLocalhost = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "::1");
  const externalPlayerMode = (!isLocalhost || (prefs?.externalPlayerMode || "local") === "stream") ? "stream" : "local";

  const launchExternalForMovie = useCallback(async (movieId: string, disc?: number, startSeconds?: number) => {
    if (!externalEnabled) return;

    if (externalPlayerMode === "stream") {
      const streamUrl = disc && disc > 1
        ? `${window.location.origin}/api/movies/${movieId}/stream?disc=${disc}`
        : `${window.location.origin}/api/movies/${movieId}/stream`;
      let protocolUrl = streamUrl;
      if (externalPlayerName === "IINA") {
        protocolUrl = `iina://weblink?url=${encodeURIComponent(streamUrl)}${startSeconds ? `&start=${startSeconds}` : ""}`;
      } else if (externalPlayerName === "PotPlayer") {
        protocolUrl = `potplayer://${streamUrl}${startSeconds ? ` /seek=${startSeconds * 1000}` : ""}`;
      }
      window.location.href = protocolUrl;
      return;
    }

    // Local mode: server-side launch
    await fetch(`/api/movies/${movieId}/play-external`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disc, startSeconds }),
    });
  }, [externalEnabled, externalPlayerMode, externalPlayerName]);

  // "Load more" state — accumulated extra items per section
  const [extraMovies, setExtraMovies] = useState<Movie[]>([]);
  const [extraPeople, setExtraPeople] = useState<Person[]>([]);
  const [extraBookmarks, setExtraBookmarks] = useState<BookmarkSearchResult[]>([]);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  // Reset extras when query/category/library changes
  useEffect(() => {
    setExtraMovies([]);
    setExtraPeople([]);
    setExtraBookmarks([]);
  }, [debouncedQuery, category, libraryId]);

  // Fetch libraries — placeholderData keeps previous value across re-renders to avoid layout shift
  const { data: libraries, isLoading: librariesLoading } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
  const showLibraryFilter = !librariesLoading && libraries && libraries.length > 1;
  const selectedLibraryName = libraries?.find((l) => l.id === libraryId)?.name;

  // Update URL when search params change
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (category !== "all") params.set("category", category);
    if (libraryId) params.set("libraryId", libraryId);
    const qs = params.toString();
    router.replace(`/search${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [debouncedQuery, category, libraryId, router]);

  // Search query
  const { data: results } = useQuery<SearchResults>({
    queryKey: ["search", debouncedQuery, category, libraryId],
    queryFn: () => {
      const params = new URLSearchParams({ q: debouncedQuery });
      if (category !== "all") params.set("category", category);
      if (libraryId) params.set("libraryId", libraryId);
      return fetch(`/api/search?${params}`).then((r) => r.json());
    },
    enabled: debouncedQuery.length > 0,
  });

  // Scroll to target genre/tag after tab switch and data render
  useEffect(() => {
    if (!scrollTarget || !results) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(scrollTarget);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollTarget, results]);

  // Suggestions for empty state
  const { data: allMovies } = useQuery<Movie[]>({
    queryKey: ["movies", "suggestions"],
    queryFn: () => fetch("/api/movies?limit=100").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const suggestions = useMemo(() => {
    if (!allMovies || allMovies.length === 0) return [];
    const shuffled = [...allMovies].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(20, shuffled.length));
  }, [allMovies]);

  // Combined items (initial + extras)
  const allMovieItems = useMemo(() => {
    if (!results?.movies?.items) return [];
    return [...results.movies.items, ...extraMovies];
  }, [results?.movies?.items, extraMovies]);

  const allPeopleItems = useMemo(() => {
    if (!results?.people?.items) return [];
    return [...results.people.items, ...extraPeople];
  }, [results?.people?.items, extraPeople]);

  const allBookmarkItems = useMemo(() => {
    if (!results?.bookmarks?.items) return [];
    return [...results.bookmarks.items, ...extraBookmarks];
  }, [results?.bookmarks?.items, extraBookmarks]);

  // Group bookmarks by movie
  const bookmarksByMovie = useMemo(() => {
    if (allBookmarkItems.length === 0) return [];
    const map = new Map<string, { movieId: string; movieTitle: string; moviePosterPath?: string | null; movieYear?: number | null; bookmarks: BookmarkSearchResult[] }>();
    for (const b of allBookmarkItems) {
      let group = map.get(b.movieId);
      if (!group) {
        group = { movieId: b.movieId, movieTitle: b.movieTitle, moviePosterPath: b.moviePosterPath, movieYear: b.movieYear, bookmarks: [] };
        map.set(b.movieId, group);
      }
      group.bookmarks.push(b);
    }
    return Array.from(map.values());
  }, [allBookmarkItems]);

  // Load more handler
  const loadMore = useCallback(async (section: "movies" | "people" | "bookmarks") => {
    if (!results || loadingMore) return;

    const currentCount =
      section === "movies" ? allMovieItems.length :
      section === "people" ? allPeopleItems.length :
      allBookmarkItems.length;

    setLoadingMore(section);
    try {
      const params = new URLSearchParams({ q: debouncedQuery, category: section, offset: String(currentCount) });
      if (libraryId) params.set("libraryId", libraryId);
      const res = await fetch(`/api/search?${params}`);
      const data: SearchResults = await res.json();

      if (section === "movies") {
        setExtraMovies((prev) => [...prev, ...data.movies.items]);
      } else if (section === "people") {
        setExtraPeople((prev) => [...prev, ...data.people.items]);
      } else {
        setExtraBookmarks((prev) => [...prev, ...data.bookmarks.items]);
      }
    } finally {
      setLoadingMore(null);
    }
  }, [results, loadingMore, debouncedQuery, libraryId, allMovieItems.length, allPeopleItems.length, allBookmarkItems.length]);

  // Section visibility
  const hasMovies = allMovieItems.length > 0;
  const hasGenres = results && results.genres?.items?.length > 0;
  const hasTags = results && results.tags?.items?.length > 0;
  const hasPeople = allPeopleItems.length > 0;
  const hasBookmarks = allBookmarkItems.length > 0;
  const hasResults = hasMovies || hasGenres || hasTags || hasPeople || hasBookmarks;

  // "Has more" checks
  const moviesTotalCount = results?.movies?.totalCount ?? 0;
  const genresTotalCount = results?.genres?.totalCount ?? 0;
  const tagsTotalCount = results?.tags?.totalCount ?? 0;
  const peopleTotalCount = results?.people?.totalCount ?? 0;
  const bookmarksTotalCount = results?.bookmarks?.totalCount ?? 0;
  const hasMoreMovies = allMovieItems.length < moviesTotalCount;
  const hasMorePeople = allPeopleItems.length < peopleTotalCount;
  const hasMoreBookmarks = allBookmarkItems.length < bookmarksTotalCount;

  const categories: { key: Category; label: string }[] = [
    { key: "all", label: t("categoryAll") },
    { key: "movies", label: t("categoryMovies") },
    { key: "genres", label: t("categoryGenres") },
    { key: "tags", label: t("categoryTags") },
    { key: "people", label: t("categoryPeople") },
    { key: "bookmarks", label: t("categoryBookmarks") },
  ];

  function handleSeeAll(cat: Category) {
    setCategory(cat);
  }

  // Build /movies link with libraryId for genre/tag navigation
  // Only available when a specific library is selected; otherwise stay in search
  function genreHref(name: string): string | null {
    if (!libraryId) return null;
    return `/movies?libraryId=${encodeURIComponent(libraryId)}&genre=${encodeURIComponent(name)}`;
  }
  function tagHref(name: string): string | null {
    if (!libraryId) return null;
    return `/movies?libraryId=${encodeURIComponent(libraryId)}&tag=${encodeURIComponent(name)}`;
  }

  function renderLoadMoreButton(section: "movies" | "people" | "bookmarks", hasMore: boolean) {
    if (!hasMore || category === "all") return null;
    const isLoading = loadingMore === section;
    return (
      <div className="flex justify-center pt-2">
        <button
          onClick={() => loadMore(section)}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/15 hover:text-foreground disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loading")}
            </>
          ) : (
            t("loadMore")
          )}
        </button>
      </div>
    );
  }

  return (
    <div id="search-scroll-container" className="h-full overflow-y-scroll">
      <div className="flex flex-col gap-4 px-12 pt-12 pb-6">
        {/* Search bar */}
        <div className="flex items-center justify-center gap-3 pt-10">
          <Search className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-[800px] rounded-sm border border-white/[0.08] bg-[var(--surface)] px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            autoFocus
          />
        </div>

        {/* Category chips + library filter */}
        <div className="flex items-center justify-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all cursor-pointer ${
                category === cat.key
                  ? "border-primary/40 bg-primary/20 text-primary backdrop-blur-sm"
                  : "border-white/[0.08] bg-white/[0.06] text-muted-foreground backdrop-blur-sm hover:bg-white/[0.12] hover:text-foreground hover:border-white/[0.15]"
              }`}
            >
              {cat.label}
            </button>
          ))}

          {showLibraryFilter && (
            <>
              <div className="mx-1 h-5 w-px bg-white/10" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-3.5 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur-sm transition-all hover:bg-white/[0.12] hover:text-foreground hover:border-white/[0.15] cursor-pointer">
                    <Library className="h-3.5 w-3.5" />
                    <span>{selectedLibraryName || t("allLibraries")}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  className="min-w-[160px] border-white/10 bg-black/70 backdrop-blur-xl"
                >
                  <DropdownMenuItem onClick={() => setLibraryId("")} className="flex items-center justify-between">
                    <span className={!libraryId ? "text-primary font-medium" : ""}>{t("allLibraries")}</span>
                    {!libraryId && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                  {libraries!.map((lib) => (
                    <DropdownMenuItem key={lib.id} onClick={() => setLibraryId(lib.id)} className="flex items-center justify-between">
                      <span className={libraryId === lib.id ? "text-primary font-medium" : ""}>{lib.name}</span>
                      {libraryId === lib.id && <Check className="h-3.5 w-3.5 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {/* Suggestions — shown when search is empty */}
        {!debouncedQuery && suggestions.length > 0 && (
          <div className="flex flex-col items-center gap-4 pt-2">
            <h3 className="text-2xl font-medium text-white/70">
              {t("suggestions")}
            </h3>
            <div className="flex flex-col items-center gap-3">
              {suggestions.map((movie) => (
                <Link
                  key={movie.id}
                  href={`/movies/${movie.id}`}
                  className="text-sm font-semibold text-primary transition-colors hover:text-primary hover:underline"
                >
                  {movie.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {debouncedQuery && hasResults && (
          <div className="flex flex-col gap-6">
            {/* Movies section */}
            {hasMovies && (category === "all" || category === "movies") && (
              <section>
                {category === "all" ? (
                  <ScrollRow
                    title={
                      <div className="flex items-center gap-2">
                        <span>{t("moviesCount", { count: moviesTotalCount })}</span>
                        {moviesTotalCount > allMovieItems.length && (
                          <button
                            onClick={() => handleSeeAll("movies")}
                            className="flex items-center gap-0.5 text-sm font-normal text-primary hover:underline cursor-pointer"
                          >
                            {t("seeAll")}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    }
                  >
                    {allMovieItems.map((movie) => (
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
                      />
                    ))}
                  </ScrollRow>
                ) : (
                  <>
                    <h2 className="mb-3 text-lg font-semibold text-foreground">
                      {t("moviesCount", { count: moviesTotalCount })}
                    </h2>
                    <div className="flex flex-wrap gap-4">
                      {allMovieItems.map((movie) => (
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
                        />
                      ))}
                    </div>
                    {renderLoadMoreButton("movies", hasMoreMovies)}
                  </>
                )}
              </section>
            )}

            {/* Genres section */}
            {hasGenres && (category === "all" || category === "genres") && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("genresCount")}
                    {genresTotalCount > 0 && ` (${genresTotalCount})`}
                  </h2>
                  {category === "all" && genresTotalCount > results.genres.items.length && (
                    <button
                      onClick={() => handleSeeAll("genres")}
                      className="flex items-center gap-0.5 text-sm font-normal text-primary hover:underline cursor-pointer"
                    >
                      {t("seeAll")}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {category === "all" ? (
                  /* Compact chips in All mode */
                  <div className="flex flex-wrap gap-2">
                    {results.genres.items.map((genre) => {
                      const href = genreHref(genre.name);
                      const chipClass = "flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20";
                      const inner = (
                        <>
                          <Tag className="h-3 w-3 text-primary" />
                          <span className="font-medium text-foreground">{genre.name}</span>
                          <span className="text-xs text-muted-foreground">({genre.movieCount})</span>
                        </>
                      );
                      return href ? (
                        <Link key={genre.name} href={href} className={chipClass}>
                          {inner}
                        </Link>
                      ) : (
                        <button
                          key={genre.name}
                          onClick={() => {
                            setScrollTarget(`genre-${genre.name}`);
                            handleSeeAll("genres");
                          }}
                          className={`${chipClass} cursor-pointer`}
                        >
                          {inner}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Full ScrollRow per genre in category mode */
                  <div className="flex flex-col gap-4">
                    {results.genres.items.map((genre) => {
                      const href = genreHref(genre.name);
                      return (
                        <div key={genre.name} id={`genre-${genre.name}`}>
                          <div className="mb-2 flex items-center gap-2">
                            <Tag className="h-4 w-4 text-primary" />
                            {href ? (
                              <Link
                                href={href}
                                className="text-sm font-medium text-foreground hover:text-primary hover:underline"
                              >
                                {genre.name}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium text-foreground">{genre.name}</span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {t("moviesInGenre", { count: genre.movieCount })}
                            </span>
                          </div>
                          <ScrollRow>
                            {genre.previewMovies.map((movie) => (
                              <MovieCard
                                key={movie.id}
                                id={movie.id}
                                title={movie.title}
                                year={movie.year ?? undefined}
                                posterPath={movie.posterPath}
                                rating={movie.communityRating}
                                personalRating={movie.personalRating}
                                videoWidth={movie.videoWidth}
                                videoHeight={movie.videoHeight}
                              />
                            ))}
                          </ScrollRow>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Tags section */}
            {hasTags && (category === "all" || category === "tags") && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("tagsCount")}
                    {tagsTotalCount > 0 && ` (${tagsTotalCount})`}
                  </h2>
                  {category === "all" && tagsTotalCount > results.tags.items.length && (
                    <button
                      onClick={() => handleSeeAll("tags")}
                      className="flex items-center gap-0.5 text-sm font-normal text-primary hover:underline cursor-pointer"
                    >
                      {t("seeAll")}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {category === "all" ? (
                  /* Compact chips in All mode */
                  <div className="flex flex-wrap gap-2">
                    {results.tags.items.map((tag) => {
                      const href = tagHref(tag.name);
                      const chipClass = "flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20";
                      const inner = (
                        <>
                          <Tag className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium text-foreground">{tag.name}</span>
                          <span className="text-xs text-muted-foreground">({tag.movieCount})</span>
                        </>
                      );
                      return href ? (
                        <Link key={tag.name} href={href} className={chipClass}>
                          {inner}
                        </Link>
                      ) : (
                        <button
                          key={tag.name}
                          onClick={() => {
                            setScrollTarget(`tag-${tag.name}`);
                            handleSeeAll("tags");
                          }}
                          className={`${chipClass} cursor-pointer`}
                        >
                          {inner}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Full ScrollRow per tag in category mode */
                  <div className="flex flex-col gap-4">
                    {results.tags.items.map((tag) => {
                      const href = tagHref(tag.name);
                      return (
                        <div key={tag.name} id={`tag-${tag.name}`}>
                          <div className="mb-2 flex items-center gap-2">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            {href ? (
                              <Link
                                href={href}
                                className="text-sm font-medium text-foreground hover:text-primary hover:underline"
                              >
                                {tag.name}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium text-foreground">{tag.name}</span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {t("moviesInGenre", { count: tag.movieCount })}
                            </span>
                          </div>
                          <ScrollRow>
                            {tag.previewMovies.map((movie) => (
                              <MovieCard
                                key={movie.id}
                                id={movie.id}
                                title={movie.title}
                                year={movie.year ?? undefined}
                                posterPath={movie.posterPath}
                                rating={movie.communityRating}
                                personalRating={movie.personalRating}
                                videoWidth={movie.videoWidth}
                                videoHeight={movie.videoHeight}
                              />
                            ))}
                          </ScrollRow>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* People section */}
            {hasPeople && (category === "all" || category === "people") && (
              <section>
                {category === "all" ? (
                  <ScrollRow
                    title={
                      <div className="flex items-center gap-2">
                        <span>{t("peopleCount", { count: peopleTotalCount })}</span>
                        {peopleTotalCount > allPeopleItems.length && (
                          <button
                            onClick={() => handleSeeAll("people")}
                            className="flex items-center gap-0.5 text-sm font-normal text-primary hover:underline cursor-pointer"
                          >
                            {t("seeAll")}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    }
                  >
                    {allPeopleItems.map((person) => (
                      <PersonCard
                        key={person.id}
                        id={person.id}
                        name={person.name}
                        role={person.type}
                        photoPath={person.photoPath}
                        personalRating={person.personalRating}
                        size="md"
                      />
                    ))}
                  </ScrollRow>
                ) : (
                  <>
                    <h2 className="mb-3 text-lg font-semibold text-foreground">
                      {t("peopleCount", { count: peopleTotalCount })}
                    </h2>
                    <div className="flex flex-wrap gap-4">
                      {allPeopleItems.map((person) => (
                        <PersonCard
                          key={person.id}
                          id={person.id}
                          name={person.name}
                          role={person.type}
                          photoPath={person.photoPath}
                          personalRating={person.personalRating}
                          size="md"
                        />
                      ))}
                    </div>
                    {renderLoadMoreButton("people", hasMorePeople)}
                  </>
                )}
              </section>
            )}

            {/* Bookmarks/Clips section — grouped by movie */}
            {hasBookmarks && (category === "all" || category === "bookmarks") && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {t("bookmarksCount", { count: bookmarksTotalCount })}
                  </h2>
                  {category === "all" && (bookmarksByMovie.length > 3 || bookmarksTotalCount > allBookmarkItems.length) && (
                    <button
                      onClick={() => handleSeeAll("bookmarks")}
                      className="flex items-center gap-0.5 text-sm font-normal text-primary hover:underline cursor-pointer"
                    >
                      {t("seeAll")}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  {(category === "all" ? bookmarksByMovie.slice(0, 3) : bookmarksByMovie).map((group) => (
                    <div key={group.movieId}>
                      <div className="mb-2 flex items-center gap-2 min-w-0">
                        <Link
                          href={`/movies/${group.movieId}`}
                          className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {group.movieTitle}
                          {group.movieYear ? ` (${group.movieYear})` : ""}
                        </Link>
                        <span className="flex-shrink-0 text-xs text-muted-foreground">
                          {group.bookmarks.length} clips
                        </span>
                      </div>
                      <ScrollRow>
                        {group.bookmarks.map((bookmark) => (
                          <BookmarkSearchCard
                            key={bookmark.id}
                            bookmark={bookmark}
                            externalEnabled={externalEnabled}
                            onExternalLaunch={launchExternalForMovie}
                          />
                        ))}
                      </ScrollRow>
                    </div>
                  ))}
                </div>
                {category !== "all" && renderLoadMoreButton("bookmarks", hasMoreBookmarks)}
              </section>
            )}
          </div>
        )}

        {/* No results */}
        {debouncedQuery && !hasResults && results && (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            {category === "all"
              ? t("noResults", { query: debouncedQuery })
              : t("noResultsForCategory", {
                  category: categories.find((c) => c.key === category)?.label || category,
                  query: debouncedQuery,
                })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Tag, ChevronRight, Loader2 } from "lucide-react";
import { MovieCard } from "@/components/movie/movie-card";
import { PersonCard } from "@/components/people/person-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import {
  BookmarkSearchCard,
  type BookmarkSearchResult,
} from "@/components/search/bookmark-search-card";
import { useTranslations } from "next-intl";

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
  previewMovies: { id: string; title: string; posterPath?: string | null; year?: number | null }[];
}

interface SearchResults {
  movies: { items: Movie[]; totalCount: number };
  genres: GenreResult[];
  tags: GenreResult[]; // same shape as genres
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

  // "Load more" state — accumulated extra items per section
  const [extraMovies, setExtraMovies] = useState<Movie[]>([]);
  const [extraPeople, setExtraPeople] = useState<Person[]>([]);
  const [extraBookmarks, setExtraBookmarks] = useState<BookmarkSearchResult[]>([]);
  const [loadingMore, setLoadingMore] = useState<string | null>(null);

  // Reset extras when query/category/library changes
  useEffect(() => {
    setExtraMovies([]);
    setExtraPeople([]);
    setExtraBookmarks([]);
  }, [debouncedQuery, category, libraryId]);

  // Fetch libraries
  const { data: libraries } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const showLibraryFilter = libraries && libraries.length > 1;

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
  const hasGenres = results && results.genres?.length > 0;
  const hasTags = results && results.tags?.length > 0;
  const hasPeople = allPeopleItems.length > 0;
  const hasBookmarks = allBookmarkItems.length > 0;
  const hasResults = hasMovies || hasGenres || hasTags || hasPeople || hasBookmarks;

  // "Has more" checks
  const moviesTotalCount = results?.movies?.totalCount ?? 0;
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
    <div className="h-full overflow-y-scroll">
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
        <div className="flex items-center justify-center gap-3">
          <div className="flex gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                  category === cat.key
                    ? "bg-primary text-white"
                    : "bg-white/10 text-muted-foreground hover:bg-white/15 hover:text-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {showLibraryFilter && (
            <select
              value={libraryId}
              onChange={(e) => setLibraryId(e.target.value)}
              className="h-8 rounded-md border border-white/[0.08] bg-[var(--surface)] px-2 text-sm text-foreground focus:border-primary focus:outline-none cursor-pointer"
            >
              <option value="">{t("allLibraries")}</option>
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.name}
                </option>
              ))}
            </select>
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
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  {t("genresCount")}
                </h2>
                <div className="flex flex-col gap-4">
                  {results.genres.map((genre) => (
                    <div key={genre.name}>
                      <div className="mb-2 flex items-center gap-2">
                        <Tag className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">
                          {genre.name}
                        </span>
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
                          />
                        ))}
                      </ScrollRow>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Tags section */}
            {hasTags && (category === "all" || category === "tags") && (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-foreground">
                  {t("tagsCount")}
                </h2>
                <div className="flex flex-col gap-4">
                  {results.tags.map((tag) => (
                    <div key={tag.name}>
                      <div className="mb-2 flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">
                          {tag.name}
                        </span>
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
                          />
                        ))}
                      </ScrollRow>
                    </div>
                  ))}
                </div>
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

            {/* Bookmarks/Clips section */}
            {hasBookmarks && (category === "all" || category === "bookmarks") && (
              <section>
                {category === "all" ? (
                  <ScrollRow
                    title={
                      <div className="flex items-center gap-2">
                        <span>{t("bookmarksCount", { count: bookmarksTotalCount })}</span>
                        {bookmarksTotalCount > allBookmarkItems.length && (
                          <button
                            onClick={() => handleSeeAll("bookmarks")}
                            className="flex items-center gap-0.5 text-sm font-normal text-primary hover:underline cursor-pointer"
                          >
                            {t("seeAll")}
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    }
                  >
                    {allBookmarkItems.map((bookmark) => (
                      <BookmarkSearchCard
                        key={bookmark.id}
                        bookmark={bookmark}
                      />
                    ))}
                  </ScrollRow>
                ) : (
                  <>
                    <h2 className="mb-3 text-lg font-semibold text-foreground">
                      {t("bookmarksCount", { count: bookmarksTotalCount })}
                    </h2>
                    <div className="flex flex-wrap gap-4">
                      {allBookmarkItems.map((bookmark) => (
                        <BookmarkSearchCard
                          key={bookmark.id}
                          bookmark={bookmark}
                        />
                      ))}
                    </div>
                    {renderLoadMoreButton("bookmarks", hasMoreBookmarks)}
                  </>
                )}
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

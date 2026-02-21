"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { MovieCard } from "@/components/movie/movie-card";
import { PersonCard } from "@/components/people/person-card";
import { ScrollRow } from "@/components/ui/scroll-row";
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
}

interface Person {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
  personalRating?: number | null;
}

interface SearchResults {
  movies: Movie[];
  people: Person[];
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, 300);
  const t = useTranslations("search");

  // Update URL when debounced query changes
  useEffect(() => {
    if (debouncedQuery) {
      router.replace(`/search?q=${encodeURIComponent(debouncedQuery)}`, {
        scroll: false,
      });
    } else {
      router.replace("/search", { scroll: false });
    }
  }, [debouncedQuery, router]);

  const { data: results } = useQuery<SearchResults>({
    queryKey: ["search", debouncedQuery],
    queryFn: () =>
      fetch(
        `/api/movies?search=${encodeURIComponent(debouncedQuery)}&includepeople=true`
      ).then((r) => r.json()),
    enabled: debouncedQuery.length > 0,
  });

  // Fetch random movies for suggestions when search is empty
  const { data: allMovies } = useQuery<Movie[]>({
    queryKey: ["movies", "suggestions"],
    queryFn: () => fetch("/api/movies?limit=100").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Pick random subset, stable until page remount
  const suggestions = useMemo(() => {
    if (!allMovies || allMovies.length === 0) return [];
    const shuffled = [...allMovies].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(20, shuffled.length));
  }, [allMovies]);

  const hasMovies = results && results.movies?.length > 0;
  const hasPeople = results && results.people?.length > 0;
  const hasResults = hasMovies || hasPeople;

  return (
    <div className="h-full overflow-y-scroll">
    <div className="flex flex-col gap-6 px-12 pt-12 pb-6">
      {/* Search bar — Jellyfin style: icon outside, centered */}
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
          {/* Movies */}
          {hasMovies && (
            <section>
              <ScrollRow
                title={t("moviesCount", { count: results.movies.length })}
              >
                {results.movies.map((movie) => (
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
            </section>
          )}

          {/* People */}
          {hasPeople && (
            <section>
              <ScrollRow
                title={t("peopleCount", { count: results.people.length })}
              >
                {results.people.map((person) => (
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
            </section>
          )}
        </div>
      )}

      {/* No results */}
      {debouncedQuery && !hasResults && results && (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          {t("noResults", { query: debouncedQuery })}
        </div>
      )}
    </div>
    </div>
  );
}

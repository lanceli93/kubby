"use client";

import { Suspense, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
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
}

interface Person {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
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

  const hasMovies = results && results.movies?.length > 0;
  const hasPeople = results && results.people?.length > 0;
  const hasResults = hasMovies || hasPeople;

  return (
    <div className="flex flex-col gap-6 px-12 py-6">
      {/* Search bar — full width, Jellyfin style */}
      <div className="relative w-full">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-12 w-full rounded-lg border border-white/[0.08] bg-[var(--surface)] pl-12 pr-4 text-lg text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          autoFocus
        />
      </div>

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
  );
}

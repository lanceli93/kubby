"use client";

import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { MovieCard } from "@/components/movie/movie-card";
import { PersonCard } from "@/components/people/person-card";
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

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(!!initialQuery);
  const t = useTranslations("search");

  const { data: results } = useQuery<SearchResults>({
    queryKey: ["search", query],
    queryFn: () =>
      fetch(`/api/movies?search=${encodeURIComponent(query)}&includepeople=true`).then(
        (r) => r.json()
      ),
    enabled: submitted && query.length > 0,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      setSubmitted(true);
      router.replace(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  const hasResults =
    results && (results.movies?.length > 0 || results.people?.length > 0);

  return (
    <div className="flex flex-col gap-8 px-12 py-8">
      {/* Search bar */}
      <form onSubmit={handleSubmit} className="flex justify-center pt-8">
        <div className="relative w-full max-w-2xl">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) setSubmitted(false);
            }}
            placeholder={t("searchPlaceholder")}
            className="h-14 w-full rounded-xl border border-white/[0.08] bg-[var(--surface)] pl-12 pr-4 text-lg text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            autoFocus
          />
        </div>
      </form>

      {/* Results */}
      {submitted && hasResults && (
        <>
          {/* Movies */}
          {results.movies.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold text-foreground">
                {t("moviesCount", { count: results.movies.length })}
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
              </div>
            </section>
          )}

          {/* People */}
          {results.people.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold text-foreground">
                {t("peopleCount", { count: results.people.length })}
              </h2>
              <div className="flex flex-wrap gap-4">
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
              </div>
            </section>
          )}
        </>
      )}

      {submitted && query && !hasResults && results && (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          {t("noResults", { query })}
        </div>
      )}
    </div>
  );
}

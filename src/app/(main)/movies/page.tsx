"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MovieCard } from "@/components/movie/movie-card";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  Folder,
  ArrowDownAZ,
  CalendarPlus,
  Calendar,
  Star,
  Timer,
} from "lucide-react";

interface Movie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  communityRating?: number | null;
}

interface Library {
  id: string;
  name: string;
  movieCount?: number;
}

export default function MovieBrowsePage() {
  return (
    <Suspense>
      <MovieBrowseContent />
    </Suspense>
  );
}

function MovieBrowseContent() {
  const searchParams = useSearchParams();
  const libraryId = searchParams.get("libraryId") || "";
  const t = useTranslations("movies");

  const [genre, setGenre] = useState("all");
  const [year, setYear] = useState("all");
  const [sort, setSort] = useState("dateAdded");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  const sortOptions = [
    { value: "title", label: t("titleAZ"), icon: ArrowDownAZ },
    { value: "dateAdded", label: t("dateAdded"), icon: CalendarPlus },
    { value: "releaseDate", label: t("releaseDate"), icon: Calendar },
    { value: "rating", label: t("rating"), icon: Star },
    { value: "runtime", label: t("runtime"), icon: Timer },
  ];

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setShowSortDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: library } = useQuery<Library>({
    queryKey: ["library", libraryId],
    queryFn: () => fetch(`/api/libraries/${libraryId}`).then((r) => r.json()),
    enabled: !!libraryId,
  });

  const { data: movies = [] } = useQuery<Movie[]>({
    queryKey: ["movies", { libraryId, genre, year, sort }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (libraryId) params.set("libraryId", libraryId);
      if (genre !== "all") params.set("genre", genre);
      if (year !== "all") params.set("year", year);
      params.set("sort", sort);
      return fetch(`/api/movies?${params}`).then((r) => r.json());
    },
  });

  const currentSortLabel =
    sortOptions.find((o) => o.value === sort)?.label || t("dateAdded");

  return (
    <div className="flex h-full flex-col">
      {/* Filter/Sort Toolbar */}
      <div className="flex h-12 items-center justify-between bg-[#0d0d14] px-12">
        <div className="flex items-center gap-3">
          {/* Genre filter */}
          <button className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-3 py-1.5 text-[13px] text-muted-foreground hover:border-white/20">
            {t("allGenres")}
            <ChevronDown className="h-3.5 w-3.5 text-[#666680]" />
          </button>
          {/* Year filter */}
          <button className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-3 py-1.5 text-[13px] text-muted-foreground hover:border-white/20">
            {t("allYears")}
            <ChevronDown className="h-3.5 w-3.5 text-[#666680]" />
          </button>
        </div>

        {/* Sort dropdown */}
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] px-3 py-1.5 text-[13px] text-muted-foreground hover:border-white/20"
          >
            {currentSortLabel}
            <ChevronDown className="h-3.5 w-3.5 text-[#666680]" />
          </button>

          {showSortDropdown && (
            <div className="absolute right-0 top-full z-50 mt-1 w-[220px] rounded-[10px] border border-white/[0.08] bg-card py-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.63)]">
              {sortOptions.map((option) => {
                const Icon = option.icon;
                const isActive = sort === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSort(option.value);
                      setShowSortDropdown(false);
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
            </div>
          )}
        </div>
      </div>

      {/* Movie Grid */}
      <div className="flex-1 overflow-auto px-12 py-6">
        {/* Library header */}
        {library && (
          <div className="mb-4 flex items-center gap-3">
            <Folder className="h-[22px] w-[22px] text-primary" />
            <h1 className="text-[22px] font-bold text-foreground">
              {library.name}
            </h1>
            <span className="text-sm text-[#666680]">
              {t("moviesCount", { count: library.movieCount ?? movies.length })}
            </span>
          </div>
        )}

        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, 180px)", justifyContent: "center" }}>
          {movies.map((movie) => (
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

        {movies.length === 0 && (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            {t("noMovies")}
          </div>
        )}
      </div>
    </div>
  );
}

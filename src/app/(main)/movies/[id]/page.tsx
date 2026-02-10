"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Play, Heart, CheckCircle } from "lucide-react";
import { PersonCard } from "@/components/people/person-card";
import { MovieCard } from "@/components/movie/movie-card";

interface MovieDetail {
  id: string;
  title: string;
  originalTitle?: string;
  overview?: string;
  year?: number;
  runtimeMinutes?: number;
  communityRating?: number;
  officialRating?: string;
  genres?: string[];
  studios?: string[];
  country?: string;
  posterPath?: string | null;
  fanartPath?: string | null;
  tmdbId?: string;
  imdbId?: string;
  cast: { id: string; name: string; role?: string; photoPath?: string | null }[];
  directors: { id: string; name: string }[];
  userData?: {
    isPlayed: boolean;
    isFavorite: boolean;
    playbackPositionSeconds: number;
  };
}

interface RecommendedMovie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  communityRating?: number | null;
}

function formatRuntime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export default function MovieDetailPage() {
  const params = useParams();
  const movieId = params.id as string;
  const queryClient = useQueryClient();

  const { data: movie } = useQuery<MovieDetail>({
    queryKey: ["movie", movieId],
    queryFn: () => fetch(`/api/movies/${movieId}`).then((r) => r.json()),
  });

  const { data: recommended = [] } = useQuery<RecommendedMovie[]>({
    queryKey: ["movies", "recommended", movieId],
    queryFn: () =>
      fetch(`/api/movies?exclude=${movieId}&limit=6`).then((r) => r.json()),
  });

  const toggleFavorite = useMutation({
    mutationFn: () =>
      fetch(`/api/movies/${movieId}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !movie?.userData?.isFavorite }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie", movieId] }),
  });

  const toggleWatched = useMutation({
    mutationFn: () =>
      fetch(`/api/movies/${movieId}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPlayed: !movie?.userData?.isPlayed }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie", movieId] }),
  });

  if (!movie) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const genres: string[] =
    typeof movie.genres === "string"
      ? JSON.parse(movie.genres)
      : movie.genres || [];
  const studios: string[] =
    typeof movie.studios === "string"
      ? JSON.parse(movie.studios)
      : movie.studios || [];

  return (
    <div className="flex flex-col">
      {/* Hero Section with Fanart */}
      <div className="relative h-[500px] w-full overflow-hidden">
        {/* Fanart Background */}
        {movie.fanartPath && (
          <Image
            src={`/api/images/${encodeURIComponent(movie.fanartPath)}`}
            alt=""
            fill
            className="object-cover"
            priority
          />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />

        {/* Content row: poster + movie info */}
        <div className="absolute inset-x-0 top-10 flex gap-9 px-20">
          {/* Poster */}
          <div className="relative h-[360px] w-60 flex-shrink-0 overflow-hidden rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {movie.posterPath ? (
              <Image
                src={`/api/images/${encodeURIComponent(movie.posterPath)}`}
                alt={movie.title}
                fill
                className="object-cover"
                sizes="240px"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[var(--surface)] text-muted-foreground">
                No Poster
              </div>
            )}
          </div>

          {/* Movie Info */}
          <div className="flex flex-col gap-3.5">
            <h1 className="text-[32px] font-bold text-foreground">
              {movie.title}
            </h1>

            {movie.originalTitle && movie.originalTitle !== movie.title && (
              <p className="text-sm text-[#666680]">{movie.originalTitle}</p>
            )}

            {/* Meta line */}
            <div className="flex items-center gap-2.5 text-sm">
              {movie.year && (
                <span className="text-muted-foreground">{movie.year}</span>
              )}
              {movie.runtimeMinutes && (
                <>
                  <span className="text-[#555568]">&middot;</span>
                  <span className="text-muted-foreground">
                    {formatRuntime(movie.runtimeMinutes)}
                  </span>
                </>
              )}
              {movie.officialRating && (
                <>
                  <span className="text-[#555568]">&middot;</span>
                  <span className="text-muted-foreground">
                    {movie.officialRating}
                  </span>
                </>
              )}
              {movie.communityRating != null && movie.communityRating > 0 && (
                <>
                  <span className="text-[#555568]">&middot;</span>
                  <span className="text-sm font-semibold text-[var(--gold)]">
                    ★ {movie.communityRating.toFixed(1)}
                  </span>
                </>
              )}
            </div>

            {/* Genre tags */}
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-md border border-white/[0.12] px-3 py-1.5 text-xs text-muted-foreground"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Link
                href={`/movies/${movie.id}/play`}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Play className="h-[18px] w-[18px]" />
                Play
              </Link>
              <button
                onClick={() => toggleFavorite.mutate()}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.12] transition-colors hover:bg-white/[0.04] ${
                  movie.userData?.isFavorite ? "text-red-500" : "text-muted-foreground"
                }`}
              >
                <Heart
                  className={`h-5 w-5 ${movie.userData?.isFavorite ? "fill-red-500" : ""}`}
                />
              </button>
              <button
                onClick={() => toggleWatched.mutate()}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.12] transition-colors hover:bg-white/[0.04] ${
                  movie.userData?.isPlayed ? "text-green-500" : "text-muted-foreground"
                }`}
              >
                <CheckCircle className="h-5 w-5" />
              </button>
            </div>

            {/* Separator */}
            <div className="h-px w-full bg-white/[0.06]" />

            {/* Overview */}
            {movie.overview && (
              <p className="max-w-[800px] text-[15px] leading-relaxed text-[#a0a0b8]">
                {movie.overview}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cast Section */}
      {movie.cast.length > 0 && (
        <section className="flex flex-col gap-5 px-20">
          <h2 className="text-xl font-semibold text-foreground">Cast</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {movie.cast.map((person) => (
              <PersonCard
                key={person.id}
                id={person.id}
                name={person.name}
                role={person.role}
                photoPath={person.photoPath}
                size="sm"
              />
            ))}
          </div>
        </section>
      )}

      {/* Additional Info */}
      <section className="flex flex-col gap-3 px-20 py-6">
        <div className="h-px w-full bg-white/[0.03]" />

        {movie.directors.length > 0 && (
          <div className="flex gap-2 text-sm">
            <span className="text-[#666680]">Director:</span>
            <span className="text-[#d0d0e0]">
              {movie.directors.map((d) => d.name).join(", ")}
            </span>
          </div>
        )}

        {studios.length > 0 && (
          <div className="flex gap-2 text-sm">
            <span className="text-[#666680]">Studio:</span>
            <span className="text-[#d0d0e0]">{studios.join(", ")}</span>
          </div>
        )}

        {movie.country && (
          <div className="flex gap-2 text-sm">
            <span className="text-[#666680]">Country:</span>
            <span className="text-[#d0d0e0]">{movie.country}</span>
          </div>
        )}

        {(movie.tmdbId || movie.imdbId) && (
          <p className="text-xs text-[#555568]">
            {movie.tmdbId && `TMDb: ${movie.tmdbId}`}
            {movie.tmdbId && movie.imdbId && " · "}
            {movie.imdbId && `IMDb: ${movie.imdbId}`}
          </p>
        )}
      </section>

      {/* Recommended Movies */}
      {recommended.length > 0 && (
        <section className="flex flex-col gap-4 px-20 pb-12 pt-4">
          <h2 className="text-xl font-semibold text-foreground">
            You May Also Like
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {recommended.map((m) => (
              <MovieCard
                key={m.id}
                id={m.id}
                title={m.title}
                year={m.year}
                posterPath={m.posterPath}
                rating={m.communityRating}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

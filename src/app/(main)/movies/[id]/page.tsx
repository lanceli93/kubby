"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Play, Heart, CheckCircle, MoreVertical, Pencil, ImageIcon, Subtitles, Search, Info, RefreshCw, Trash2 } from "lucide-react";
import { PersonCard } from "@/components/people/person-card";
import { MovieCard } from "@/components/movie/movie-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MovieMetadataEditor } from "@/components/movie/movie-metadata-editor";

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
  const t = useTranslations("movies");
  const tMeta = useTranslations("metadata");
  const [metadataOpen, setMetadataOpen] = useState(false);

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
      {/* Hero Section with Fanart — Jellyfin style */}
      <div className="relative min-h-[650px] w-full overflow-hidden">
        {/* Fanart Background */}
        {movie.fanartPath && (
          <Image
            src={resolveImageSrc(movie.fanartPath)}
            alt=""
            fill
            className="object-cover"
            priority
          />
        )}

        {/* Bottom gradient — fade to page background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
        {/* Left-to-right gradient — dark behind text, fanart peeks through on right */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-background/20" />

        {/* Content row: poster + movie info */}
        <div className="absolute inset-x-0 bottom-0 flex gap-8 px-20 pb-10">
          {/* Poster — 350×525 (2:3) */}
          <div className="relative h-[525px] w-[350px] flex-shrink-0 overflow-hidden rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {movie.posterPath ? (
              <Image
                src={resolveImageSrc(movie.posterPath)}
                alt={movie.title}
                fill
                className="object-cover"
                sizes="350px"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[var(--surface)] text-muted-foreground">
                No Poster
              </div>
            )}
          </div>

          {/* Movie Info — no glass, text-shadow for readability */}
          <div className="flex min-w-0 flex-1 flex-col gap-3 py-2 [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">
            <h1 className="text-4xl font-bold text-white">
              {movie.title}
            </h1>

            {movie.originalTitle && movie.originalTitle !== movie.title && (
              <p className="text-sm text-white/60">{movie.originalTitle}</p>
            )}

            {/* Meta line: Year · Runtime · Rating · ★ Score */}
            <div className="flex items-center gap-2.5 text-sm text-white/70">
              {movie.year && <span>{movie.year}</span>}
              {movie.runtimeMinutes && (
                <>
                  <span className="text-white/40">&middot;</span>
                  <span>{formatRuntime(movie.runtimeMinutes)}</span>
                </>
              )}
              {movie.officialRating && (
                <>
                  <span className="text-white/40">&middot;</span>
                  <span>{movie.officialRating}</span>
                </>
              )}
              {movie.communityRating != null && movie.communityRating > 0 && (
                <>
                  <span className="text-white/40">&middot;</span>
                  <span className="font-semibold text-[var(--gold)]">
                    ★ {movie.communityRating.toFixed(1)}
                  </span>
                </>
              )}
            </div>

            {/* Action buttons — Jellyfin-style uniform small buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Link
                href={`/movies/${movie.id}/play`}
                className="flex items-center gap-1.5 rounded-md bg-white/90 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white"
              >
                <Play className="h-4 w-4 fill-black" />
                Play
              </Link>
              <button
                onClick={() => toggleWatched.mutate()}
                className={`flex h-9 w-9 items-center justify-center rounded-md border border-white/20 transition-colors hover:bg-white/10 ${
                  movie.userData?.isPlayed ? "text-green-400" : "text-white/70"
                }`}
                title="Mark as watched"
              >
                <CheckCircle className="h-4.5 w-4.5" />
              </button>
              <button
                onClick={() => toggleFavorite.mutate()}
                className={`flex h-9 w-9 items-center justify-center rounded-md border border-white/20 transition-colors hover:bg-white/10 ${
                  movie.userData?.isFavorite ? "text-red-400" : "text-white/70"
                }`}
                title="Favorite"
              >
                <Heart
                  className={`h-4.5 w-4.5 ${movie.userData?.isFavorite ? "fill-red-400" : ""}`}
                />
              </button>

              {/* Three-dot menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-white/20 text-white/70 transition-colors hover:bg-white/10"
                  >
                    <MoreVertical className="h-4.5 w-4.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-52 border-white/10 bg-black/70 backdrop-blur-xl"
                >
                  <DropdownMenuItem onClick={() => setMetadataOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    {t("editMetadata")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => alert("Edit images — coming soon")}>
                    <ImageIcon className="h-4 w-4" />
                    {tMeta("editImages")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => alert("Edit subtitles — coming soon")}>
                    <Subtitles className="h-4 w-4" />
                    {tMeta("editSubtitles")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => alert("Identify — coming soon")}>
                    <Search className="h-4 w-4" />
                    {tMeta("identify")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => alert("Media info — coming soon")}>
                    <Info className="h-4 w-4" />
                    {t("mediaInfo")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => alert("Refresh metadata — coming soon")}>
                    <RefreshCw className="h-4 w-4" />
                    {t("refreshMetadata")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => alert("Delete media — coming soon")}>
                    <Trash2 className="h-4 w-4" />
                    {tMeta("deleteMedia")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Overview */}
            {movie.overview && (
              <p className="max-w-[700px] text-[15px] leading-relaxed text-white/80">
                {movie.overview}
              </p>
            )}

            {/* Metadata list — vertical label: value pairs */}
            <div className="flex flex-col gap-1.5 pt-1 text-sm">
              {genres.length > 0 && (
                <div>
                  <span className="text-white/50">Genres: </span>
                  <span className="text-white/90">{genres.join(", ")}</span>
                </div>
              )}
              {movie.directors.length > 0 && (
                <div>
                  <span className="text-white/50">Director: </span>
                  <span className="text-white/90">{movie.directors.map((d) => d.name).join(", ")}</span>
                </div>
              )}
              {studios.length > 0 && (
                <div>
                  <span className="text-white/50">Studio: </span>
                  <span className="text-white/90">{studios.join(", ")}</span>
                </div>
              )}
              {movie.country && (
                <div>
                  <span className="text-white/50">Country: </span>
                  <span className="text-white/90">{movie.country}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cast Section */}
      {movie.cast.length > 0 && (
        <section className="px-20 mt-[10px]">
          <ScrollRow title={t("cast")}>
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
          </ScrollRow>
        </section>
      )}

      {/* Recommended Movies */}
      {recommended.length > 0 && (
        <section className={`flex flex-col gap-4 px-20 pb-12 ${movie.cast.length > 0 ? "pt-4" : "mt-[10px]"}`}>
          <h2 className="text-xl font-semibold text-foreground">
            {t("youMayAlsoLike")}
          </h2>
          <ScrollRow>
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
          </ScrollRow>
        </section>
      )}

      {/* Metadata editor dialog */}
      <MovieMetadataEditor
        movieId={movieId}
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
      />
    </div>
  );
}

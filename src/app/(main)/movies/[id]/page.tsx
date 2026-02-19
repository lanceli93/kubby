"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Play, Heart, CheckCircle, MoreVertical, Pencil, ImageIcon, Subtitles, Search, Info, RefreshCw, Trash2, Sparkles } from "lucide-react";
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
import { StarRatingDialog } from "@/components/movie/star-rating-dialog";
import { useUserPreferences } from "@/hooks/use-user-preferences";

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
  videoCodec?: string | null;
  audioCodec?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  audioChannels?: number | null;
  container?: string | null;
  tags?: string[];
  premiereDate?: string;
  cast: { id: string; name: string; role?: string; photoPath?: string | null; personalRating?: number | null; birthDate?: string | null; birthYear?: number | null }[];
  directors: { id: string; name: string }[];
  userData?: {
    isPlayed: boolean;
    isFavorite: boolean;
    playbackPositionSeconds: number;
    personalRating?: number | null;
    dimensionRatings?: Record<string, number> | null;
  };
}

interface RecommendedMovie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  communityRating?: number | null;
  personalRating?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
}

function formatRuntime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function getResolutionLabel(width?: number | null, height?: number | null): string | null {
  if (!width && !height) return null;
  const w = width || 0;
  const h = height || 0;
  if (w >= 3840 || h >= 2160) return "4K";
  if (w >= 1920 || h >= 1080) return "1080P";
  if (w >= 1280 || h >= 720) return "720P";
  if (w >= 720 || h >= 480) return "480P";
  return `${h}P`;
}

function formatChannels(channels?: number | null): string | null {
  if (!channels) return null;
  if (channels === 8) return "7.1";
  if (channels === 6) return "5.1";
  if (channels === 2) return "Stereo";
  if (channels === 1) return "Mono";
  return `${channels}ch`;
}

function computeAgeAtRelease(
  birthYear?: number | null,
  birthDate?: string | null,
  premiereDate?: string,
  movieYear?: number
): number | null {
  // Prefer birthYear (simple year subtraction)
  if (birthYear) {
    const releaseYear = movieYear || (premiereDate ? new Date(premiereDate).getFullYear() : null);
    if (!releaseYear) return null;
    const age = releaseYear - birthYear;
    return age >= 0 ? age : null;
  }
  // Fall back to birthDate for precise calculation
  if (!birthDate) return null;
  let releaseDate: Date | null = null;
  if (premiereDate) {
    releaseDate = new Date(premiereDate);
  } else if (movieYear) {
    releaseDate = new Date(movieYear, 6, 1);
  }
  if (!releaseDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime()) || isNaN(releaseDate.getTime())) return null;
  let age = releaseDate.getFullYear() - birth.getFullYear();
  const monthDiff = releaseDate.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && releaseDate.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

export default function MovieDetailPage() {
  const params = useParams();
  const movieId = params.id as string;
  const queryClient = useQueryClient();
  const t = useTranslations("movies");
  const tMeta = useTranslations("metadata");
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const { data: prefs } = useUserPreferences();
  const movieDimensions = prefs?.movieRatingDimensions ?? [];

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

  const savePersonalRating = async (rating: number | null, dimensionRatings?: Record<string, number> | null) => {
    await fetch(`/api/movies/${movieId}/user-data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personalRating: rating, dimensionRatings }),
    });
    queryClient.invalidateQueries({ queryKey: ["movie", movieId] });
  };

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
  const tags: string[] =
    typeof movie.tags === "string"
      ? JSON.parse(movie.tags)
      : movie.tags || [];

  return (
    <div className="flex flex-col">
      {/* Hero Section with Fanart — Jellyfin style */}
      <div className="relative min-h-[750px] w-full overflow-hidden">
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
        <div className="absolute inset-x-0 bottom-0 flex gap-8 px-20 pb-16">
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
                  <span className="inline-flex items-center gap-1 font-semibold text-purple-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    {movie.communityRating.toFixed(1)}
                  </span>
                </>
              )}
              <span className="text-white/40">&middot;</span>
              {movie.userData?.personalRating != null && movie.userData.personalRating > 0 ? (
                <button
                  onClick={() => setRatingOpen(true)}
                  className="font-semibold text-[var(--gold)] transition-opacity hover:opacity-80 cursor-pointer"
                >
                  ★ {movie.userData.personalRating.toFixed(1)}
                </button>
              ) : (
                <button
                  onClick={() => setRatingOpen(true)}
                  className="text-white/40 transition-colors hover:text-[var(--gold)] cursor-pointer"
                  title={t("setRating")}
                >
                  ★
                </button>
              )}
            </div>

            {/* Video info badges */}
            {(movie.videoCodec || movie.audioCodec || movie.videoWidth || movie.container) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {getResolutionLabel(movie.videoWidth, movie.videoHeight) && (
                  <span className="rounded border border-white/30 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-white/90">
                    {getResolutionLabel(movie.videoWidth, movie.videoHeight)}
                  </span>
                )}
                {movie.videoCodec && (
                  <span className="rounded border border-white/30 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-white/90">
                    {movie.videoCodec}
                  </span>
                )}
                {movie.audioCodec && (
                  <span className="rounded border border-white/30 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-white/90">
                    {movie.audioCodec}
                  </span>
                )}
                {formatChannels(movie.audioChannels) && (
                  <span className="rounded border border-white/30 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-white/90">
                    {formatChannels(movie.audioChannels)}
                  </span>
                )}
                {movie.container && (
                  <span className="rounded border border-white/30 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-white/90">
                    {movie.container}
                  </span>
                )}
              </div>
            )}

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
              {tags.length > 0 && (
                <div>
                  <span className="text-white/50">{t("tags")}: </span>
                  <span className="text-white/90">{tags.join(", ")}</span>
                </div>
              )}
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
                personalRating={person.personalRating}
                age={computeAgeAtRelease(person.birthYear, person.birthDate, movie.premiereDate, movie.year)}
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
                personalRating={m.personalRating}
                videoWidth={m.videoWidth}
                videoHeight={m.videoHeight}
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

      {/* Personal rating dialog */}
      <StarRatingDialog
        open={ratingOpen}
        onOpenChange={setRatingOpen}
        value={movie.userData?.personalRating ?? null}
        onSave={savePersonalRating}
        dimensions={movieDimensions}
        dimensionRatings={movie.userData?.dimensionRatings}
      />
    </div>
  );
}

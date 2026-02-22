"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Play, Heart, CheckCircle, MoreVertical, Pencil, ImageIcon, Subtitles, Search, Info, RefreshCw, Trash2, Sparkles, Maximize2, Disc, Monitor, Check, AlertCircle } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { MovieMetadataEditor } from "@/components/movie/movie-metadata-editor";
import { MediaInfoDialog } from "@/components/movie/media-info-dialog";
import { StarRatingDialog } from "@/components/movie/star-rating-dialog";
import { ImageEditorDialog } from "@/components/shared/image-editor-dialog";
import { useUserPreferences } from "@/hooks/use-user-preferences";

interface DiscInfo {
  id: string;
  discNumber: number;
  filePath: string;
  label?: string;
  posterPath?: string | null;
  runtimeSeconds?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  audioChannels?: number | null;
  container?: string | null;
}

interface MovieDetail {
  id: string;
  title: string;
  originalTitle?: string;
  overview?: string;
  year?: number;
  runtimeMinutes?: number;
  runtimeSeconds?: number;
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
  mediaLibraryId?: string;
  discCount?: number;
  discs?: DiscInfo[];
  cast: { id: string; name: string; role?: string; photoPath?: string | null; photoBlur?: string | null; personalRating?: number | null; birthDate?: string | null; birthYear?: number | null }[];
  directors: { id: string; name: string }[];
  userData?: {
    isPlayed: boolean;
    isFavorite: boolean;
    playbackPositionSeconds: number;
    currentDisc?: number;
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

function formatRuntime(totalSeconds?: number, minutes?: number) {
  const secs = totalSeconds || (minutes ? minutes * 60 : 0);
  if (secs <= 0) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getResolutionLabel(width?: number | null): string | null {
  const w = width || 0;
  if (w >= 8000) return "8K";
  if (w >= 7000) return "7K";
  if (w >= 6000) return "6K";
  if (w >= 5000) return "5K";
  if (w >= 3500) return "4K";
  if (w >= 3000) return "3K";
  if (w >= 2500) return "2K";
  if (w >= 1920) return "FHD";
  if (w >= 1280) return "HD";
  if (w > 0) return "SD";
  return null;
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
  const router = useRouter();
  const movieId = params.id as string;
  const queryClient = useQueryClient();
  const t = useTranslations("movies");
  const tMeta = useTranslations("metadata");
  const tCommon = useTranslations("common");
  const tSettings = useTranslations("settings");
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [mediaInfoOpen, setMediaInfoOpen] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [fanartMode, setFanartMode] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [externalToast, setExternalToast] = useState<string | null>(null);
  const { data: prefs } = useUserPreferences();
  const movieDimensions = prefs?.movieRatingDimensions ?? [];
  const SUPPORTED_PLAYERS = ["IINA", "PotPlayer"];
  const externalPlayerName = SUPPORTED_PLAYERS.includes(prefs?.externalPlayerName || "") ? prefs!.externalPlayerName : null;
  const externalEnabled = prefs?.externalPlayerEnabled && !!externalPlayerName;
  const isLocalhost = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "::1");
  const externalPlayerMode = (!isLocalhost || (prefs?.externalPlayerMode || "local") === "stream") ? "stream" : "local";

  function getStreamUrl(disc?: number): string {
    return disc && disc > 1
      ? `${window.location.origin}/api/movies/${movieId}/stream?disc=${disc}`
      : `${window.location.origin}/api/movies/${movieId}/stream`;
  }

  async function launchExternal(disc?: number) {
    if (!externalEnabled) {
      setExternalToast(t("configureExternalPlayer"));
      setTimeout(() => setExternalToast(null), 3000);
      return;
    }

    if (externalPlayerMode === "stream") {
      const streamUrl = getStreamUrl(disc);
      let protocolUrl = streamUrl;
      if (externalPlayerName === "IINA") {
        protocolUrl = `iina://weblink?url=${encodeURIComponent(streamUrl)}`;
      } else if (externalPlayerName === "PotPlayer") {
        protocolUrl = `potplayer://${streamUrl}`;
      }
      window.location.href = protocolUrl;
      setExternalToast(t("launchedIn", { player: externalPlayerName || "" }));
      setTimeout(() => setExternalToast(null), 3000);
      return;
    }

    // Local mode: server-side launch
    try {
      const res = await fetch(`/api/movies/${movieId}/play-external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disc }),
      });
      if (res.ok) {
        setExternalToast(t("launchedIn", { player: externalPlayerName || "" }));
      } else {
        setExternalToast(t("externalPlayerFailed"));
      }
    } catch {
      setExternalToast(t("externalPlayerFailed"));
    }
    setTimeout(() => setExternalToast(null), 3000);
  }

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

  const deleteMovie = useMutation({
    mutationFn: () =>
      fetch(`/api/movies/${movieId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movies"] });
      router.push("/movies");
    },
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
    <div className="h-full overflow-y-scroll">
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

        {/* Fanart fullscreen click-to-dismiss overlay */}
        {fanartMode && (
          <div
            className="absolute inset-0 z-20 cursor-pointer"
            onClick={() => setFanartMode(false)}
          />
        )}


        {/* Bottom gradient — fade to page background */}
        <div className={`absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background transition-opacity duration-300 ${fanartMode ? "opacity-0 pointer-events-none" : ""}`} />
        {/* Left-to-right gradient — dark behind text, fanart peeks through on right */}
        <div className={`absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/30 transition-opacity duration-300 ${fanartMode ? "opacity-0 pointer-events-none" : ""}`} />

        {/* Content row: poster + movie info */}
        <div className={`absolute inset-x-0 bottom-0 flex gap-8 px-20 pb-24 transition-opacity duration-300 ${fanartMode ? "opacity-0 pointer-events-none" : ""}`}>
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
            {(movie.videoCodec || movie.audioCodec || movie.videoWidth || movie.container || movie.runtimeSeconds || movie.runtimeMinutes) && (
              <div className="flex flex-wrap items-center gap-2">
                {getResolutionLabel(movie.videoWidth) && (
                  <span className="rounded border border-white/30 px-2 py-1 text-xs font-semibold uppercase text-white/90">
                    {getResolutionLabel(movie.videoWidth)}
                  </span>
                )}
                {movie.videoWidth && movie.videoHeight && (
                  <span className="rounded border border-white/30 px-2 py-1 text-xs font-semibold uppercase text-white/90">
                    {movie.videoWidth} × {movie.videoHeight}
                  </span>
                )}
                {movie.videoCodec && (
                  <span className="rounded border border-white/30 px-2 py-1 text-xs font-semibold uppercase text-white/90">
                    {movie.videoCodec}
                  </span>
                )}
                {movie.audioCodec && (
                  <span className="rounded border border-white/30 px-2 py-1 text-xs font-semibold uppercase text-white/90">
                    {movie.audioCodec}
                  </span>
                )}
                {formatChannels(movie.audioChannels) && (
                  <span className="rounded border border-white/30 px-2 py-1 text-xs font-semibold uppercase text-white/90">
                    {formatChannels(movie.audioChannels)}
                  </span>
                )}
                {movie.container && (
                  <span className="rounded border border-white/30 px-2 py-1 text-xs font-semibold uppercase text-white/90">
                    {movie.container}
                  </span>
                )}
                {(movie.runtimeSeconds || movie.runtimeMinutes) && (
                  <span className="rounded border border-white/30 px-2 py-1 text-xs font-semibold uppercase text-white/90">
                    {formatRuntime(movie.runtimeSeconds, movie.runtimeMinutes)}
                  </span>
                )}
              </div>
            )}

            {/* Action buttons — Jellyfin-style uniform small buttons */}
            <div className="flex items-center gap-2 pt-1">
              {externalEnabled ? (
                <button
                  onClick={() => launchExternal()}
                  className="flex items-center gap-2 rounded-lg bg-white/90 px-6 py-2.5 text-base font-semibold text-black transition-colors hover:bg-white cursor-pointer"
                >
                  <Play className="h-5 w-5 fill-black" />
                  {t("playExternal", { player: externalPlayerName || "" })}
                </button>
              ) : (
                <Link
                  href={`/movies/${movie.id}/play`}
                  className="flex items-center gap-2 rounded-lg bg-white/90 px-6 py-2.5 text-base font-semibold text-black transition-colors hover:bg-white"
                >
                  <Play className="h-5 w-5 fill-black" />
                  {(movie.discCount ?? 1) > 1 ? t("playAll") : t("play")}
                </Link>
              )}
              <button
                onClick={async () => {
                  if (!externalPlayerName) {
                    setExternalToast("__configure__");
                    setTimeout(() => setExternalToast(null), 5000);
                    return;
                  }
                  const newEnabled = !prefs?.externalPlayerEnabled;
                  await fetch("/api/settings/personal-metadata", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ externalPlayerEnabled: newEnabled }),
                  });
                  queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
                }}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 transition-colors hover:bg-white/10 cursor-pointer ${
                  externalEnabled ? "text-blue-400" : "text-white/70"
                }`}
                title={`External player: ${externalEnabled ? "on" : "off"}`}
              >
                <Monitor className="h-5 w-5" />
              </button>
              {movie.fanartPath && (
                <button
                  onClick={() => setFanartMode(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 text-white/70 transition-colors hover:bg-white/10"
                  title="View fanart"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => toggleWatched.mutate()}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 transition-colors hover:bg-white/10 ${
                  movie.userData?.isPlayed ? "text-green-400" : "text-white/70"
                }`}
                title="Mark as watched"
              >
                <CheckCircle className="h-5 w-5" />
              </button>
              <button
                onClick={() => toggleFavorite.mutate()}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 transition-colors hover:bg-white/10 ${
                  movie.userData?.isFavorite ? "text-red-400" : "text-white/70"
                }`}
                title="Favorite"
              >
                <Heart
                  className={`h-5 w-5 ${movie.userData?.isFavorite ? "fill-red-400" : ""}`}
                />
              </button>

              {/* Three-dot menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 text-white/70 transition-colors hover:bg-white/10"
                  >
                    <MoreVertical className="h-5 w-5" />
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
                  <DropdownMenuItem onClick={() => setImageEditorOpen(true)}>
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
                  <DropdownMenuItem onClick={() => setMediaInfoOpen(true)}>
                    <Info className="h-4 w-4" />
                    {t("mediaInfo")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => alert("Refresh metadata — coming soon")}>
                    <RefreshCw className="h-4 w-4" />
                    {t("refreshMetadata")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                    {tMeta("deleteMedia")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Overview */}
            {movie.overview && (
              <p className="max-w-[800px] text-[15px] leading-relaxed text-white/80 line-clamp-5">
                {movie.overview}
              </p>
            )}

            {/* Metadata list — vertical label: value pairs */}
            <div className="flex flex-col gap-1.5 pt-1 text-sm">
              {tags.length > 0 && (
                <div>
                  <span className="text-white/50">{t("tags")}: </span>
                  <span className="text-white/90">
                    {tags.map((tag, i) => (
                      <span key={tag}>
                        {i > 0 && ", "}
                        <Link
                          href={`/movies?libraryId=${movie.mediaLibraryId}&tag=${encodeURIComponent(tag)}`}
                          className="hover:text-white hover:underline transition-colors"
                        >
                          {tag}
                        </Link>
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {genres.length > 0 && (
                <div>
                  <span className="text-white/50">Genres: </span>
                  <span className="text-white/90">
                    {genres.map((genre, i) => (
                      <span key={genre}>
                        {i > 0 && ", "}
                        <Link
                          href={`/movies?libraryId=${movie.mediaLibraryId}&genre=${encodeURIComponent(genre)}`}
                          className="hover:text-white hover:underline transition-colors"
                        >
                          {genre}
                        </Link>
                      </span>
                    ))}
                  </span>
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
                  <span className="text-white/90">
                    {studios.map((studio, i) => (
                      <span key={studio}>
                        {i > 0 && ", "}
                        <Link
                          href={`/movies?libraryId=${movie.mediaLibraryId}&studio=${encodeURIComponent(studio)}`}
                          className="hover:text-white hover:underline transition-colors"
                        >
                          {studio}
                        </Link>
                      </span>
                    ))}
                  </span>
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

      {/* Discs Section (multi-disc movies only) */}
      {(movie.discCount ?? 1) > 1 && movie.discs && movie.discs.length > 0 && (
        <section className="px-20 mt-[10px]">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {t("discs")} ({movie.discs.length})
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {movie.discs.map((disc) => (
              externalEnabled ? (
              <button
                key={disc.id}
                onClick={() => launchExternal(disc.discNumber)}
                className="group flex flex-shrink-0 gap-4 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10 cursor-pointer text-left"
              >
                {/* Disc poster with play overlay */}
                <div className="relative h-[160px] w-[107px] flex-shrink-0 overflow-hidden rounded-md">
                  {disc.posterPath ? (
                    <Image
                      src={resolveImageSrc(disc.posterPath)}
                      alt={disc.label || `Disc ${disc.discNumber}`}
                      fill
                      className="object-cover"
                      sizes="107px"
                    />
                  ) : movie.posterPath ? (
                    <Image
                      src={resolveImageSrc(movie.posterPath)}
                      alt={disc.label || `Disc ${disc.discNumber}`}
                      fill
                      className="object-cover"
                      sizes="107px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[var(--surface)] text-muted-foreground">
                      <Disc className="h-6 w-6" />
                    </div>
                  )}
                  {/* Centered play button on hover */}
                  <div className="absolute inset-0 z-[3] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white/90 transition-all duration-200 hover:scale-150 hover:bg-primary/80 hover:text-white">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                    </div>
                  </div>
                </div>
                {/* Info on the right */}
                <div className="flex flex-col justify-center gap-2 pr-3">
                  <span className="text-base font-semibold text-foreground">
                    {disc.label || `${t("disc")} ${disc.discNumber}`}
                  </span>
                  {disc.runtimeSeconds && disc.runtimeSeconds > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {formatRuntime(disc.runtimeSeconds)}
                    </span>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {getResolutionLabel(disc.videoWidth) && (
                      <span className="rounded border border-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase text-white/70">
                        {getResolutionLabel(disc.videoWidth)}
                      </span>
                    )}
                    {disc.videoCodec && (
                      <span className="rounded border border-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase text-white/70">
                        {disc.videoCodec}
                      </span>
                    )}
                    {disc.audioCodec && (
                      <span className="rounded border border-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase text-white/70">
                        {disc.audioCodec}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              ) : (
              <Link
                key={disc.id}
                href={`/movies/${movie.id}/play?disc=${disc.discNumber}`}
                className="group flex flex-shrink-0 gap-4 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10"
              >
                {/* Disc poster with play overlay */}
                <div className="relative h-[160px] w-[107px] flex-shrink-0 overflow-hidden rounded-md">
                  {disc.posterPath ? (
                    <Image
                      src={resolveImageSrc(disc.posterPath)}
                      alt={disc.label || `Disc ${disc.discNumber}`}
                      fill
                      className="object-cover"
                      sizes="107px"
                    />
                  ) : movie.posterPath ? (
                    <Image
                      src={resolveImageSrc(movie.posterPath)}
                      alt={disc.label || `Disc ${disc.discNumber}`}
                      fill
                      className="object-cover"
                      sizes="107px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[var(--surface)] text-muted-foreground">
                      <Disc className="h-6 w-6" />
                    </div>
                  )}
                  {/* Centered play button on hover — matches MovieCard style */}
                  <div className="absolute inset-0 z-[3] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white/90 transition-all duration-200 hover:scale-150 hover:bg-primary/80 hover:text-white">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                    </div>
                  </div>
                </div>
                {/* Info on the right */}
                <div className="flex flex-col justify-center gap-2 pr-3">
                  <span className="text-base font-semibold text-foreground">
                    {disc.label || `${t("disc")} ${disc.discNumber}`}
                  </span>
                  {disc.runtimeSeconds && disc.runtimeSeconds > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {formatRuntime(disc.runtimeSeconds)}
                    </span>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {getResolutionLabel(disc.videoWidth) && (
                      <span className="rounded border border-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase text-white/70">
                        {getResolutionLabel(disc.videoWidth)}
                      </span>
                    )}
                    {disc.videoCodec && (
                      <span className="rounded border border-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase text-white/70">
                        {disc.videoCodec}
                      </span>
                    )}
                    {disc.audioCodec && (
                      <span className="rounded border border-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase text-white/70">
                        {disc.audioCodec}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              )
            ))}
          </div>
        </section>
      )}

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
                photoBlur={person.photoBlur}
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

      {/* Media info dialog */}
      <MediaInfoDialog
        movieId={movieId}
        open={mediaInfoOpen}
        onOpenChange={setMediaInfoOpen}
      />

      {/* Image editor dialog */}
      <ImageEditorDialog
        open={imageEditorOpen}
        onOpenChange={setImageEditorOpen}
        entityType="movie"
        entityId={movieId}
        entityName={movie.title}
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

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="border-white/[0.06] bg-card sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("deleteMovie")}</DialogTitle>
            <DialogDescription>{t("confirmDeleteMovie")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteOpen(false)}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={() => {
                deleteMovie.mutate();
                setDeleteOpen(false);
              }}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {tCommon("confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* External player toast */}
      {externalToast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-lg border px-5 py-3 text-sm font-medium shadow-lg backdrop-blur-sm transition-all duration-300 ${
          externalToast === "__configure__"
            ? "border-red-500/20 bg-red-500/10 text-white"
            : "border-green-500/20 bg-green-500/10 text-green-400"
        }`}>
          {externalToast === "__configure__" ? (
            <>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                {t("configureExternalPlayer")}{" "}
                <Link href="/settings" className="underline font-semibold text-blue-400 hover:text-blue-300">
                  {tSettings("settings")} → {tSettings("playback")}
                </Link>
              </span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4 flex-shrink-0" />
              {externalToast}
            </>
          )}
        </div>
      )}
    </div>
    </div>
  );
}

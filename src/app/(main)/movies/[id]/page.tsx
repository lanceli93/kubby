"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Play, Heart, CheckCircle, MoreVertical, Pencil, ImageIcon, Info, Trash2, Sparkles, Maximize2, Disc, Monitor, AlertCircle, BookmarkPlus } from "lucide-react";
import { GlassToast } from "@/components/ui/glass-toast";
import { BookmarkCard, type CustomIconData } from "@/components/movie/bookmark-card";
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
import { FrameScrubber } from "@/components/movie/frame-scrubber";

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
  cast: { id: string; name: string; role?: string; photoPath?: string | null; photoBlur?: string | null; personalRating?: number | null; isFavorite?: boolean | null; ageAtRelease?: number | null }[];
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

interface BookmarkData {
  id: string;
  timestampSeconds: number;
  discNumber?: number;
  iconType?: string;
  tags?: string[];
  note?: string;
  thumbnailPath?: string | null;
  thumbnailAspect?: number | null;
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
  const [bookmarkMode, setBookmarkMode] = useState(false);
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  const onImgError = (path: string) => setImgErrors(prev => new Set(prev).add(path));
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

  async function launchExternal(disc?: number, startSeconds?: number) {
    if (!externalEnabled) {
      setExternalToast(t("configureExternalPlayer"));
      setTimeout(() => setExternalToast(null), 3000);
      return;
    }

    if (externalPlayerMode === "stream") {
      const streamUrl = getStreamUrl(disc);
      let protocolUrl = streamUrl;
      if (externalPlayerName === "IINA") {
        protocolUrl = `iina://weblink?url=${encodeURIComponent(streamUrl)}${startSeconds ? `&start=${startSeconds}` : ""}`;
      } else if (externalPlayerName === "PotPlayer") {
        protocolUrl = `potplayer://${streamUrl}${startSeconds ? ` /seek=${Math.round(startSeconds)}` : ""}`;
      }
      console.log("[external-player] protocol URL:", protocolUrl);
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
        body: JSON.stringify({ disc, startSeconds }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.cmd) console.log("[external-player] cmd:", data.cmd);
        setExternalToast(t("launchedIn", { player: externalPlayerName || "" }));
      } else {
        console.error("[external-player] error:", data);
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

  const { data: bookmarks = [] } = useQuery<BookmarkData[]>({
    queryKey: ["movie-bookmarks", movieId],
    queryFn: async () => {
      const r = await fetch(`/api/movies/${movieId}/bookmarks`);
      if (!r.ok) throw new Error("Failed to fetch bookmarks");
      return r.json();
    },
  });

  const { data: customIcons = [] } = useQuery<CustomIconData[]>({
    queryKey: ["bookmark-icons"],
    queryFn: async () => {
      const r = await fetch("/api/settings/bookmark-icons");
      if (!r.ok) throw new Error("Failed to fetch bookmark icons");
      return r.json();
    },
  });

  const deleteBookmark = useMutation({
    mutationFn: (bookmarkId: string) =>
      fetch(`/api/movies/${movieId}/bookmarks/${bookmarkId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie-bookmarks", movieId] }),
  });

  const updateBookmark = useMutation({
    mutationFn: ({ bookmarkId, data }: { bookmarkId: string; data: { iconType?: string; tags?: string[]; note?: string } }) =>
      fetch(`/api/movies/${movieId}/bookmarks/${bookmarkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie-bookmarks", movieId] }),
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

  const [deleteFiles, setDeleteFiles] = useState(false);

  const deleteMovie = useMutation({
    mutationFn: (opts?: { deleteFiles?: boolean }) =>
      fetch(`/api/movies/${movieId}${opts?.deleteFiles ? "?deleteFiles=true" : ""}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movies"] });
      router.push("/movies");
    },
  });

  const togglePersonFavorite = useMutation({
    mutationFn: ({ id, current }: { id: string; current: boolean }) =>
      fetch(`/api/people/${id}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !current }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movie", movieId] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
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
    <div className="h-full overflow-y-scroll scrollbar-hide">
    <div className="flex flex-col">
      {/* Hero Section with Fanart — Jellyfin style */}
      <div className="relative md:min-h-[750px] w-full overflow-hidden">
        {/* Fanart Background */}
        {movie.fanartPath && !imgErrors.has(movie.fanartPath) && (
          <div className="relative h-[220px] w-full md:absolute md:inset-0 md:h-auto">
            <Image
              src={resolveImageSrc(movie.fanartPath)}
              alt=""
              fill
              className="object-cover"
              priority
              onError={() => onImgError(movie.fanartPath!)}
            />
          </div>
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
        {/* Left-to-right gradient — softened for glass effect */}
        <div className={`hidden md:block absolute inset-0 bg-gradient-to-r from-background/60 via-background/30 to-transparent transition-opacity duration-300 ${fanartMode ? "opacity-0 pointer-events-none" : ""}`} />

        {/* Content row: poster + movie info */}
        <div className={`relative md:absolute md:inset-x-0 md:bottom-0 flex gap-8 pt-3 md:pt-0 px-4 pb-6 md:px-20 md:pb-24 ${fanartMode ? "opacity-0 pointer-events-none invisible transition-[opacity] duration-300" : ""}`}>
          {/* Poster — 350×525 (2:3) */}
          <div className="hidden md:block relative h-[525px] w-[350px] flex-shrink-0 overflow-hidden rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
            {movie.posterPath && !imgErrors.has(movie.posterPath) ? (
              <Image
                src={resolveImageSrc(movie.posterPath)}
                alt={movie.title}
                fill
                className="object-cover"
                sizes="350px"
                onError={() => onImgError(movie.posterPath!)}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[var(--surface)] text-muted-foreground">
                No Poster
              </div>
            )}
          </div>

          {/* Movie Info — glass panel over fanart */}
          <div className="backdrop-blur-[20px] bg-[rgba(10,10,15,0.45)] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_0.5px_0_rgba(255,255,255,0.1)] flex min-w-0 flex-1 flex-col gap-3 rounded-lg p-4 md:p-6">
            <h1 className="text-2xl md:text-3xl font-bold text-white truncate">
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

            {/* Video info badges — glass pills */}
            {(movie.videoCodec || movie.audioCodec || movie.videoWidth || movie.container || movie.runtimeSeconds || movie.runtimeMinutes) && (
              <div className="flex flex-wrap items-center gap-2">
                {getResolutionLabel(movie.videoWidth) && (
                  <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                    {getResolutionLabel(movie.videoWidth)}
                  </span>
                )}
                {movie.videoWidth && movie.videoHeight && (
                  <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                    {movie.videoWidth} × {movie.videoHeight}
                  </span>
                )}
                {movie.videoCodec && (
                  <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                    {movie.videoCodec}
                  </span>
                )}
                {movie.audioCodec && (
                  <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                    {movie.audioCodec}
                  </span>
                )}
                {formatChannels(movie.audioChannels) && (
                  <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                    {formatChannels(movie.audioChannels)}
                  </span>
                )}
                {movie.container && (
                  <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                    {movie.container}
                  </span>
                )}
                {(movie.runtimeSeconds || movie.runtimeMinutes) && (
                  <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                    {formatRuntime(movie.runtimeSeconds, movie.runtimeMinutes)}
                  </span>
                )}
              </div>
            )}

            {/* Action buttons — Jellyfin-style uniform small buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {externalEnabled ? (
                <button
                  onClick={() => launchExternal()}
                  className="flex w-full md:w-auto items-center justify-center gap-2 rounded-xl bg-white/90 px-6 py-2.5 text-base font-semibold text-black shadow-lg shadow-white/10 transition-all hover:bg-white hover:shadow-white/20 cursor-pointer"
                >
                  <Play className="h-5 w-5 fill-black" />
                  {t("playExternal", { player: externalPlayerName || "" })}
                </button>
              ) : (
                <Link
                  href={`/movies/${movie.id}/play?disc=1&t=0`}
                  className="flex w-full md:w-auto items-center justify-center gap-2 rounded-xl bg-white/90 px-6 py-2.5 text-base font-semibold text-black shadow-lg shadow-white/10 transition-all hover:bg-white hover:shadow-white/20"
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
                className={`glass-btn flex h-11 w-11 items-center justify-center rounded-xl transition-all cursor-pointer ${
                  externalEnabled ? "text-indigo-400" : "text-white/70"
                }`}
                title={`External player: ${externalEnabled ? "on" : "off"}`}
              >
                <Monitor className="h-5 w-5" />
              </button>
              {movie.fanartPath && (
                <button
                  onClick={() => setFanartMode(true)}
                  className="glass-btn hidden md:flex h-11 w-11 items-center justify-center rounded-xl text-white/70 transition-all"
                  title="View fanart"
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => toggleWatched.mutate()}
                className={`glass-btn flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                  movie.userData?.isPlayed ? "text-green-400" : "text-white/70"
                }`}
                title="Mark as watched"
              >
                <CheckCircle className="h-5 w-5" />
              </button>
              <button
                onClick={() => toggleFavorite.mutate()}
                className={`glass-btn flex h-11 w-11 items-center justify-center rounded-xl transition-all ${
                  movie.userData?.isFavorite ? "text-red-400" : "text-white/70"
                }`}
                title="Favorite"
              >
                <Heart
                  className={`h-5 w-5 ${movie.userData?.isFavorite ? "fill-red-400" : ""}`}
                />
              </button>

              {/* Bookmark mode toggle */}
              {(movie.runtimeSeconds || movie.runtimeMinutes) && (
                <button
                  onClick={() => setBookmarkMode((v) => !v)}
                  className={`glass-btn hidden md:flex h-11 w-11 items-center justify-center rounded-xl transition-all cursor-pointer ${
                    bookmarkMode ? "text-yellow-400" : "text-white/70"
                  }`}
                  title={t("bookmarkMode")}
                >
                  <BookmarkPlus className="h-5 w-5" />
                </button>
              )}

              {/* Three-dot menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="glass-btn flex h-11 w-11 items-center justify-center rounded-xl text-white/70 transition-all"
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
                  <DropdownMenuItem onClick={() => setMediaInfoOpen(true)}>
                    <Info className="h-4 w-4" />
                    {t("mediaInfo")}
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
              <p className="max-w-full md:max-w-[80%] text-[15px] leading-relaxed text-white/80 line-clamp-5">
                {movie.overview}
              </p>
            )}

            {/* Metadata list — vertical label: value pairs */}
            <div className="flex flex-col gap-1.5 pt-1 text-sm max-w-full md:max-w-[80%]">
              {tags.length > 0 && (
                <div className="line-clamp-3">
                  <span className="text-white/50">{t("tags")}: </span>
                  <span className="text-white/90">
                    {tags.map((tag, i) => (
                      <span key={`${tag}-${i}`}>
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

      {/* Frame Scrubber for bookmark mode */}
      {bookmarkMode && (movie.runtimeSeconds || movie.runtimeMinutes) && (
        <section className="px-4 md:px-20 mt-4">
          <FrameScrubber
            movieId={movieId}
            runtimeSeconds={movie.runtimeSeconds || (movie.runtimeMinutes || 0) * 60}
            discCount={movie.discCount ?? 1}
            discs={movie.discs?.map((d) => ({ discNumber: d.discNumber, label: d.label, runtimeSeconds: d.runtimeSeconds }))}
            bookmarks={bookmarks}
            customIcons={customIcons}
            disabledIconIds={prefs?.disabledBookmarkIcons}
            cast={movie.cast?.map((c) => ({ id: c.id, name: c.name, photoPath: c.photoPath }))}
            onClose={() => setBookmarkMode(false)}
          />
        </section>
      )}

      <div className="stagger-children">
      {/* Discs Section (multi-disc movies only) */}
      {(movie.discCount ?? 1) > 1 && movie.discs && movie.discs.length > 0 && (
        <section className="px-4 md:px-20 mt-4">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {t("discs")} ({movie.discs.length})
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {movie.discs.map((disc) => {
              const poster = (
                <div className="relative w-full overflow-hidden rounded-md bg-[var(--surface)] ring-1 ring-white/[0.06] aspect-[2/3]">
                  {disc.posterPath && !imgErrors.has(disc.posterPath) ? (
                    <Image
                      src={resolveImageSrc(disc.posterPath)}
                      alt={disc.label || `Disc ${disc.discNumber}`}
                      fill
                      className="object-cover transition-fluid group-hover:scale-105"
                      sizes="140px"
                      onError={() => onImgError(disc.posterPath!)}
                    />
                  ) : movie.posterPath && !imgErrors.has(movie.posterPath) ? (
                    <Image
                      src={resolveImageSrc(movie.posterPath)}
                      alt={disc.label || `Disc ${disc.discNumber}`}
                      fill
                      className="object-cover transition-fluid group-hover:scale-105"
                      sizes="140px"
                      onError={() => onImgError(movie.posterPath!)}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Disc className="h-6 w-6" />
                    </div>
                  )}
                  {/* Resolution badge — top-left */}
                  {getResolutionLabel(disc.videoWidth) && (
                    <div className="absolute left-1.5 top-1.5 rounded-sm bg-white/30 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/80 shadow-sm">
                      {getResolutionLabel(disc.videoWidth)}
                    </div>
                  )}
                  {/* Disc number badge — bottom-right, liquid glass */}
                  <div className="absolute right-1.5 bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full glass-badge text-[11px] font-bold text-white/90 shadow-lg">
                    {disc.discNumber}
                  </div>
                  {/* Centered play button on hover */}
                  <div className="absolute inset-0 z-[3] flex items-center justify-center scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-fluid">
                    <div className="glass-btn flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-fluid hover:scale-120 active:scale-95">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                    </div>
                  </div>
                </div>
              );
              const info = (
                <div className="mt-1.5 px-0.5 text-center">
                  <p className="truncate text-sm font-medium text-foreground">
                    {disc.label || `${t("disc")} ${disc.discNumber}`}
                  </p>
                  {disc.runtimeSeconds && disc.runtimeSeconds > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatRuntime(disc.runtimeSeconds)}
                    </p>
                  )}
                </div>
              );
              return externalEnabled ? (
                <button
                  key={disc.id}
                  onClick={() => launchExternal(disc.discNumber)}
                  className="group flex-shrink-0 cursor-pointer text-left transition-[scale] duration-200 ease-out hover:scale-[1.03]"
                  style={{ width: 140 }}
                >
                  {poster}
                  {info}
                </button>
              ) : (
                <Link
                  key={disc.id}
                  href={`/movies/${movie.id}/play?disc=${disc.discNumber}`}
                  className="group flex-shrink-0 transition-[scale] duration-200 ease-out hover:scale-[1.03]"
                  style={{ width: 140 }}
                >
                  {poster}
                  {info}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Bookmarks Section */}
      {bookmarks.length > 0 && (() => {
        const landscapeBm = bookmarks.filter((bm) => (bm.thumbnailAspect ?? 1.78) >= 1);
        const portraitBm = bookmarks.filter((bm) => (bm.thumbnailAspect ?? 1.78) < 1);
        return (
          <section className="px-4 md:px-20 mt-4 space-y-2">
            {landscapeBm.length > 0 && (
              <ScrollRow title={portraitBm.length > 0 ? `${t("bookmarks")} — ${t("landscape")} (${landscapeBm.length})` : `${t("bookmarks")} (${landscapeBm.length})`}>
                {landscapeBm.map((bm) => (
                  <BookmarkCard
                    key={bm.id}
                    bookmark={bm}
                    movieId={movieId}
                    externalEnabled={externalEnabled}
                    onExternalLaunch={(disc, startSeconds) => launchExternal(disc, startSeconds)}
                    onUpdate={(id, data) => updateBookmark.mutate({ bookmarkId: id, data })}
                    onDelete={(id) => deleteBookmark.mutate(id)}
                    customIcons={customIcons}
                    disabledIconIds={prefs?.disabledBookmarkIcons}
                  />
                ))}
              </ScrollRow>
            )}
            {portraitBm.length > 0 && (
              <ScrollRow title={landscapeBm.length > 0 ? `${t("bookmarks")} — ${t("portrait")} (${portraitBm.length})` : `${t("bookmarks")} (${portraitBm.length})`}>
                {portraitBm.map((bm) => (
                  <BookmarkCard
                    key={bm.id}
                    bookmark={bm}
                    movieId={movieId}
                    externalEnabled={externalEnabled}
                    onExternalLaunch={(disc, startSeconds) => launchExternal(disc, startSeconds)}
                    onUpdate={(id, data) => updateBookmark.mutate({ bookmarkId: id, data })}
                    onDelete={(id) => deleteBookmark.mutate(id)}
                    customIcons={customIcons}
                    disabledIconIds={prefs?.disabledBookmarkIcons}
                  />
                ))}
              </ScrollRow>
            )}
          </section>
        );
      })()}

      {/* Cast Section */}
      {movie.cast.length > 0 && (
        <section className="px-4 md:px-20 mt-4">
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
                isFavorite={!!person.isFavorite}
                age={person.ageAtRelease}
                size="movie"
                onToggleFavorite={() => togglePersonFavorite.mutate({ id: person.id, current: !!person.isFavorite })}
              />
            ))}
          </ScrollRow>
        </section>
      )}

      {/* Recommended Movies */}
      {recommended.length > 0 && (
        <section className={`flex flex-col gap-4 px-4 md:px-20 pb-12 ${movie.cast.length > 0 ? "pt-4" : "mt-4"}`}>
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
      </div>

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
        dimensionWeights={prefs?.movieDimensionWeights}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteFiles(false); }}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("deleteMovie")}</DialogTitle>
            <DialogDescription>{t("confirmDeleteMovie")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 accent-destructive"
              />
              <span className="text-sm text-foreground">{t("deleteLocalFiles")}</span>
            </label>
            {deleteFiles && (
              <p className="text-xs text-destructive pl-6">{t("deleteLocalFilesWarning")}</p>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setDeleteOpen(false)}
              className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={() => {
                deleteMovie.mutate({ deleteFiles });
                setDeleteOpen(false);
                setDeleteFiles(false);
              }}
              className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 cursor-pointer"
            >
              {tCommon("confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* External player toast */}
      <GlassToast visible={!!externalToast} success={externalToast !== "__configure__"} position="top">
        {externalToast === "__configure__" ? (
          <span>
            {t("configureExternalPlayer")}{" "}
            <Link href="/preferences/playback" className="underline font-semibold text-primary hover:text-primary/80">
              {tSettings("playback")}
            </Link>
          </span>
        ) : (
          externalToast
        )}
      </GlassToast>
    </div>
    </div>
  );
}

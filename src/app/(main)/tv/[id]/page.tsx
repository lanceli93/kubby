"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Play, Heart, CheckCircle, Sparkles, Clock, Tv, MoreVertical, Pencil, ImageIcon, Trash2, Info, Monitor, Star } from "lucide-react";
import { GlassToast } from "@/components/ui/glass-toast";
import { PersonCard } from "@/components/people/person-card";
import { BookmarkCard, type CustomIconData } from "@/components/movie/bookmark-card";
import { ShowCard } from "@/components/tv/show-card";
import { ScrollRow } from "@/components/ui/scroll-row";
import { resolveImageSrc } from "@/lib/image-utils";
import { TiltCard } from "@/components/ui/tilt-card";
import { useHeroParallax } from "@/hooks/use-hero-parallax";
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
import { TvShowMetadataEditor } from "@/components/tv/tv-show-metadata-editor";
import { ImageEditorDialog } from "@/components/shared/image-editor-dialog";
import { StarRatingDialog } from "@/components/movie/star-rating-dialog";
import { MediaInfoDialog } from "@/components/movie/media-info-dialog";
import { useUserPreferences } from "@/hooks/use-user-preferences";

interface EpisodeItem {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeNumberEnd?: number | null;
  title?: string | null;
  overview?: string | null;
  stillPath?: string | null;
  stillBlur?: string | null;
  runtimeSeconds?: number | null;
  runtimeMinutes?: number | null;
  airDate?: string | null;
  isPlayed: boolean;
  playbackPositionSeconds: number;
  progress: number;
  personalRating?: number | null;
}

interface SeasonItem {
  id: string;
  seasonNumber: number;
  title?: string | null;
  posterPath?: string | null;
  posterBlur?: string | null;
  episodes: EpisodeItem[];
}

interface ShowDetail {
  id: string;
  title: string;
  originalTitle?: string;
  overview?: string;
  year?: number;
  status?: string | null;
  communityRating?: number | null;
  officialRating?: string;
  genres?: string[];
  studios?: string[];
  country?: string[];
  mediaLibraryId?: string;
  posterPath?: string | null;
  fanartPath?: string | null;
  seasonCount?: number | null;
  episodeCount?: number | null;
  seasons: SeasonItem[];
  cast: { id: string; name: string; role?: string; photoPath?: string | null; photoBlur?: string | null; personalRating?: number | null; isFavorite?: boolean | null; ageAtRelease?: number | null }[];
  directors: { id: string; name: string }[];
  userData: { isFavorite: boolean; personalRating?: number | null; dimensionRatings?: Record<string, number> | null } | null;
}

// Aggregated show-wide bookmark (one per episode bookmark) from
// GET /api/tv/[id]/bookmarks — carries the episodeId so per-bookmark
// edit/delete can target the right per-episode route.
interface ShowBookmark {
  id: string;
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string | null;
  timestampSeconds: number;
  iconType?: string;
  tags?: string[];
  note?: string;
  thumbnailPath?: string | null;
  thumbnailAspect?: number | null;
  viewState?: { lon: number; lat: number; fov: number } | null;
}

// Recommended "more like this" show — same-genre row, shaped like ShowCard.
interface RecommendedShow {
  id: string;
  title: string;
  year?: number | null;
  posterPath?: string | null;
  posterBlur?: string | null;
}

// Minimal media-info shape — we only need the first video/audio stream to
// derive the technical badges (codec / resolution / audio).
interface MediaInfoStream {
  streamType: "video" | "audio" | "subtitle";
  codec: string | null;
  width: number | null;
  height: number | null;
  channels: number | null;
}

interface EpisodeMediaInfo {
  container: string | null;
  streams: MediaInfoStream[];
}

function formatRuntime(totalSeconds?: number | null, minutes?: number | null) {
  const secs = totalSeconds || (minutes ? minutes * 60 : 0);
  if (secs <= 0) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
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

export default function ShowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const showId = params.id as string;
  const queryClient = useQueryClient();
  const t = useTranslations("tv");
  const tMovies = useTranslations("movies");
  const tMeta = useTranslations("metadata");
  const tCommon = useTranslations("common");
  const tSettings = useTranslations("settings");
  const { data: prefs } = useUserPreferences();
  const tvShowDimensions = prefs?.tvShowRatingDimensions ?? [];
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  const onImgError = (path: string) => setImgErrors((prev) => new Set(prev).add(path));
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [mediaInfoOpen, setMediaInfoOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [externalToast, setExternalToast] = useState<string | null>(null);
  // Per-episode rating dialog — holds the episode being rated (id + its
  // current personal rating / dimension ratings) so the shared dialog opens
  // preloaded and saves back to the right episode.
  const [ratingEpisode, setRatingEpisode] = useState<EpisodeItem | null>(null);

  const SUPPORTED_PLAYERS = ["IINA", "PotPlayer"];
  const externalPlayerName = SUPPORTED_PLAYERS.includes(prefs?.externalPlayerName || "") ? prefs!.externalPlayerName : null;
  const externalEnabled = prefs?.externalPlayerEnabled && !!externalPlayerName;
  const isLocalhost = typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.hostname === "::1");
  const externalPlayerMode = (!isLocalhost || (prefs?.externalPlayerMode || "local") === "stream") ? "stream" : "local";

  // Launch the given episode in the configured external player. Mirrors the
  // movie page's launchExternal but targets the ISOLATED TV episode routes.
  async function launchExternal(episodeId: string, startSeconds?: number) {
    if (!externalEnabled) {
      setExternalToast(tMovies("configureExternalPlayer"));
      setTimeout(() => setExternalToast(null), 3000);
      return;
    }

    if (externalPlayerMode === "stream") {
      const streamUrl = `${window.location.origin}/api/tv/episodes/${episodeId}/stream`;
      let protocolUrl = streamUrl;
      if (externalPlayerName === "IINA") {
        protocolUrl = `iina://weblink?url=${encodeURIComponent(streamUrl)}${startSeconds ? `&start=${startSeconds}` : ""}`;
      } else if (externalPlayerName === "PotPlayer") {
        protocolUrl = `potplayer://${streamUrl}${startSeconds ? ` /seek=${Math.round(startSeconds)}` : ""}`;
      }
      console.log("[external-player] protocol URL:", protocolUrl);
      window.location.href = protocolUrl;
      setExternalToast(tMovies("launchedIn", { player: externalPlayerName || "" }));
      setTimeout(() => setExternalToast(null), 3000);
      return;
    }

    // Local mode: server-side launch
    try {
      const res = await fetch(`/api/tv/episodes/${episodeId}/play-external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startSeconds }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.cmd) console.log("[external-player] cmd:", data.cmd);
        setExternalToast(tMovies("launchedIn", { player: externalPlayerName || "" }));
      } else {
        console.error("[external-player] error:", data);
        setExternalToast(tMovies("externalPlayerFailed"));
      }
    } catch {
      setExternalToast(tMovies("externalPlayerFailed"));
    }
    setTimeout(() => setExternalToast(null), 3000);
  }

  const { data: show } = useQuery<ShowDetail>({
    queryKey: ["tv-show", showId],
    queryFn: () => fetch(`/api/tv/${showId}`).then((r) => r.json()),
  });

  // First episode across all seasons (ordered) — the source for the technical
  // badges, MediaInfo dialog, and the "open in external player" menu item when
  // no specific episode is selected.
  const firstEpisodeId =
    show?.seasons?.flatMap((s) => s.episodes).find((e) => e)?.id ?? null;
  const firstGenre = show?.genres?.[0] ?? null;

  // Technical badges — derived from the first episode's media-info streams.
  const { data: episodeMediaInfo } = useQuery<EpisodeMediaInfo>({
    queryKey: ["tv-episode-media-info", firstEpisodeId],
    queryFn: async () => {
      const r = await fetch(`/api/tv/episodes/${firstEpisodeId}/media-info`);
      if (!r.ok) throw new Error("Failed to fetch media info");
      return r.json();
    },
    enabled: !!firstEpisodeId,
  });

  // "More like this" — same-genre shows, current show excluded client-side
  // (the /api/tv list route has no exclude param).
  const { data: recommendedRaw = [] } = useQuery<RecommendedShow[]>({
    queryKey: ["tv-recommended", showId, firstGenre],
    queryFn: async () => {
      const r = await fetch(`/api/tv?genre=${encodeURIComponent(firstGenre!)}&limit=12`);
      if (!r.ok) throw new Error("Failed to fetch recommended");
      return r.json();
    },
    enabled: !!firstGenre,
  });
  const recommended = recommendedRaw.filter((s) => s.id !== showId).slice(0, 12);

  const { data: bookmarks = [] } = useQuery<ShowBookmark[]>({
    queryKey: ["tv-show-bookmarks", showId],
    queryFn: async () => {
      const r = await fetch(`/api/tv/${showId}/bookmarks`);
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

  const { scrollRef, heroRef, fanartRef, posterRef } = useHeroParallax({ ready: !!show });

  const toggleFavorite = useMutation({
    mutationFn: () =>
      fetch(`/api/tv/${showId}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !show?.userData?.isFavorite }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tv-show", showId] }),
  });

  const toggleEpisodeWatched = useMutation({
    mutationFn: ({ episodeId, isPlayed }: { episodeId: string; isPlayed: boolean }) =>
      fetch(`/api/tv/episodes/${episodeId}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPlayed }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tv-show", showId] }),
  });

  const savePersonalRating = async (rating: number | null, dimensionRatings?: Record<string, number> | null) => {
    await fetch(`/api/tv/${showId}/user-data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personalRating: rating, dimensionRatings }),
    });
    queryClient.invalidateQueries({ queryKey: ["tv-show", showId] });
  };

  const deleteShow = useMutation({
    mutationFn: (opts?: { deleteFiles?: boolean }) =>
      fetch(`/api/tv/${showId}${opts?.deleteFiles ? "?deleteFiles=true" : ""}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tv-shows"] });
      router.push("/tv");
    },
  });

  // Bookmark edit/delete hit the PER-EPISODE routes; the episodeId comes from
  // each aggregated bookmark and is captured in the map closure below.
  const deleteBookmark = useMutation({
    mutationFn: ({ episodeId, bookmarkId }: { episodeId: string; bookmarkId: string }) =>
      fetch(`/api/tv/episodes/${episodeId}/bookmarks/${bookmarkId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tv-show-bookmarks", showId] }),
  });

  const updateBookmark = useMutation({
    mutationFn: ({ episodeId, bookmarkId, data }: { episodeId: string; bookmarkId: string; data: { iconType?: string; tags?: string[]; note?: string } }) =>
      fetch(`/api/tv/episodes/${episodeId}/bookmarks/${bookmarkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tv-show-bookmarks", showId] }),
  });

  // Cast favoriting — hits the ISOLATED TV person endpoint, never the cinema
  // /api/people route (tv_people ids must never resolve against cinema tables).
  const togglePersonFavorite = useMutation({
    mutationFn: ({ id, current }: { id: string; current: boolean }) =>
      fetch(`/api/tv/people/${id}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !current }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tv-show", showId] }),
  });

  // Per-episode personal rating — PUTs the episode user-data and refreshes the
  // show so the saved rating shows on the row.
  const saveEpisodeRating = async (rating: number | null, dimensionRatings?: Record<string, number> | null) => {
    if (!ratingEpisode) return;
    await fetch(`/api/tv/episodes/${ratingEpisode.id}/user-data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personalRating: rating, dimensionRatings }),
    });
    queryClient.invalidateQueries({ queryKey: ["tv-show", showId] });
  };

  if (!show) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  const seasons = show.seasons ?? [];
  const activeSeasonNumber = selectedSeason ?? seasons[0]?.seasonNumber ?? 0;
  const activeSeason = seasons.find((s) => s.seasonNumber === activeSeasonNumber) ?? seasons[0];

  const seasonLabel = (num: number) => (num === 0 ? t("specials") : t("season", { number: num }));

  return (
    <div ref={scrollRef} className="h-full overflow-y-scroll scrollbar-hide">
      <div className="flex flex-col">
        {/* Hero Section with Fanart */}
        <div ref={heroRef} className="relative md:min-h-[750px] w-full overflow-hidden">
          {show.fanartPath && !imgErrors.has(show.fanartPath) && (
            <div
              ref={fanartRef}
              className="relative h-[220px] w-full md:absolute md:inset-0 md:h-auto md:scale-105 will-change-transform"
            >
              <Image
                src={resolveImageSrc(show.fanartPath, 1920)}
                alt=""
                fill
                className="object-cover"
                priority
                onError={() => onImgError(show.fanartPath!)}
              />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
          <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-background/60 via-background/30 to-transparent" />

          {/* Content row: poster + show info */}
          <div className="relative md:absolute md:inset-x-0 md:bottom-0 flex gap-8 pt-3 md:pt-0 px-4 pb-6 md:px-20 md:pb-24">
            <div ref={posterRef} className="hidden md:block relative h-[525px] w-[350px] flex-shrink-0 will-change-transform">
              {show.posterPath && !imgErrors.has(show.posterPath) && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-lg bg-cover bg-center opacity-45 blur-[28px] saturate-[1.4]"
                  style={{ backgroundImage: `url(${resolveImageSrc(show.posterPath, 200)})` }}
                />
              )}
              <TiltCard maxTilt={4} className="h-full w-full">
                <div className="relative h-full w-full overflow-hidden rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
                  {show.posterPath && !imgErrors.has(show.posterPath) ? (
                    <Image
                      src={resolveImageSrc(show.posterPath, 600)}
                      alt={show.title}
                      fill
                      className="object-cover"
                      sizes="350px"
                      onError={() => onImgError(show.posterPath!)}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[var(--surface)] text-muted-foreground">
                      <Tv className="h-10 w-10" />
                    </div>
                  )}
                </div>
              </TiltCard>
            </div>

            {/* Show Info — glass panel over fanart */}
            <div className="backdrop-blur-[20px] bg-[rgba(10,10,15,0.45)] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_0.5px_0_rgba(255,255,255,0.1)] flex min-w-0 flex-1 flex-col gap-3 rounded-lg p-4 md:p-6">
              <h1 className="text-2xl md:text-3xl font-bold text-white truncate">{show.title}</h1>

              {show.originalTitle && show.originalTitle !== show.title && (
                <p className="text-sm text-white/60">{show.originalTitle}</p>
              )}

              {/* Meta line: Year · Status · Rating */}
              <div className="flex items-center gap-2.5 text-sm text-white/70">
                {show.year && <span>{show.year}</span>}
                {show.status && (
                  <>
                    <span className="text-white/40">&middot;</span>
                    <span>{show.status === "Continuing" ? t("showStatus.continuing") : show.status === "Ended" ? t("showStatus.ended") : show.status}</span>
                  </>
                )}
                {show.communityRating != null && show.communityRating > 0 && (
                  <>
                    <span className="text-white/40">&middot;</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-purple-400">
                      <Sparkles className="h-3.5 w-3.5" />
                      {show.communityRating.toFixed(1)}
                    </span>
                  </>
                )}
                <span className="text-white/40">&middot;</span>
                {show.userData?.personalRating != null && show.userData.personalRating > 0 ? (
                  <button
                    onClick={() => setRatingOpen(true)}
                    className="font-semibold text-[var(--gold)] transition-opacity hover:opacity-80 cursor-pointer"
                  >
                    ★ {show.userData.personalRating.toFixed(1)}
                  </button>
                ) : (
                  <button
                    onClick={() => setRatingOpen(true)}
                    className="text-white/40 transition-colors hover:text-[var(--gold)] cursor-pointer"
                    title={tMovies("setRating")}
                  >
                    ★
                  </button>
                )}
              </div>

              {/* Badges — season/episode counts + technical info (codec /
                  resolution / audio) sourced from the first episode's media-info. */}
              {(() => {
                const videoStream = episodeMediaInfo?.streams.find((s) => s.streamType === "video");
                const audioStream = episodeMediaInfo?.streams.find((s) => s.streamType === "audio");
                const resolutionLabel = getResolutionLabel(videoStream?.width);
                const channelsLabel = formatChannels(audioStream?.channels);
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    {show.seasonCount != null && (
                      <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                        {t("seasons")}: {show.seasonCount}
                      </span>
                    )}
                    {show.episodeCount != null && (
                      <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                        {t("episodeCount", { count: show.episodeCount })}
                      </span>
                    )}
                    {resolutionLabel && (
                      <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                        {resolutionLabel}
                      </span>
                    )}
                    {videoStream?.width && videoStream?.height && (
                      <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                        {videoStream.width} × {videoStream.height}
                      </span>
                    )}
                    {videoStream?.codec && (
                      <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                        {videoStream.codec}
                      </span>
                    )}
                    {audioStream?.codec && (
                      <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                        {audioStream.codec}
                      </span>
                    )}
                    {channelsLabel && (
                      <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                        {channelsLabel}
                      </span>
                    )}
                    {episodeMediaInfo?.container && (
                      <span className="glass-badge rounded-md px-2.5 py-1 text-xs font-semibold uppercase text-white/90">
                        {episodeMediaInfo.container}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => toggleFavorite.mutate()}
                  className={`glass-btn flex h-11 w-11 items-center justify-center rounded-xl transition-all cursor-pointer ${
                    show.userData?.isFavorite ? "text-red-400" : "text-white/70"
                  }`}
                  title={t("favorite")}
                >
                  <Heart className={`h-5 w-5 ${show.userData?.isFavorite ? "fill-red-400" : ""}`} />
                </button>

                {/* External player toggle — mirrors the movie page; shows a
                    "configure" toast when no supported player is set. */}
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
                      {tMeta("editMetadata")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setImageEditorOpen(true)}>
                      <ImageIcon className="h-4 w-4" />
                      {tMeta("editImages")}
                    </DropdownMenuItem>
                    {firstEpisodeId && (
                      <DropdownMenuItem onClick={() => setMediaInfoOpen(true)}>
                        <Info className="h-4 w-4" />
                        {tMovies("mediaInfo")}
                      </DropdownMenuItem>
                    )}
                    {externalEnabled && firstEpisodeId && (
                      <DropdownMenuItem onClick={() => launchExternal(firstEpisodeId)}>
                        <Monitor className="h-4 w-4" />
                        {tMovies("playExternal", { player: externalPlayerName || "" })}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                      <Trash2 className="h-4 w-4" />
                      {tMeta("deleteMedia")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Overview */}
              {show.overview && (
                <p className="max-w-full md:max-w-[80%] text-[15px] leading-relaxed text-white/80 line-clamp-5">
                  {show.overview}
                </p>
              )}

              {/* Metadata list */}
              <div className="flex flex-col gap-1.5 pt-1 text-sm max-w-full md:max-w-[80%]">
                {show.genres && show.genres.length > 0 && (
                  <div>
                    <span className="text-white/50">Genres: </span>
                    <span className="text-white/90">
                      {show.genres.map((genre, i) => (
                        <span key={genre}>
                          {i > 0 && ", "}
                          <Link
                            href={`/tv?${show.mediaLibraryId ? `libraryId=${show.mediaLibraryId}&` : ""}genre=${encodeURIComponent(genre)}`}
                            className="hover:text-white hover:underline transition-colors"
                          >
                            {genre}
                          </Link>
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {show.directors && show.directors.length > 0 && (
                  <div>
                    <span className="text-white/50">Director: </span>
                    <span className="text-white/90">{show.directors.map((d) => d.name).join(", ")}</span>
                  </div>
                )}
                {show.studios && show.studios.length > 0 && (
                  <div>
                    <span className="text-white/50">Studio: </span>
                    <span className="text-white/90">
                      {show.studios.map((studio, i) => (
                        <span key={studio}>
                          {i > 0 && ", "}
                          <Link
                            href={`/tv?${show.mediaLibraryId ? `libraryId=${show.mediaLibraryId}&` : ""}studio=${encodeURIComponent(studio)}`}
                            className="hover:text-white hover:underline transition-colors"
                          >
                            {studio}
                          </Link>
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="stagger-children">
          {/* Season selector + episode list */}
          {seasons.length > 0 && (
            <section className="px-4 md:px-20 mt-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {seasons.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSeason(s.seasonNumber)}
                    className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      activeSeasonNumber === s.seasonNumber
                        ? "bg-primary text-primary-foreground"
                        : "glass-btn text-white/70 hover:text-white"
                    }`}
                  >
                    {seasonLabel(s.seasonNumber)}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {activeSeason?.episodes.length ? (
                  activeSeason.episodes.map((ep) => {
                    const inProgress = !ep.isPlayed && ep.playbackPositionSeconds > 0;
                    return (
                      <div
                        key={ep.id}
                        className="flex gap-4 rounded-lg p-3 transition-colors hover:bg-white/[0.04]"
                      >
                        {/* Still thumbnail */}
                        <div className="relative h-[90px] w-[160px] flex-shrink-0 overflow-hidden rounded-md bg-[var(--surface)] ring-1 ring-white/[0.06]">
                          {ep.stillPath && !imgErrors.has(ep.stillPath) ? (
                            <Image
                              src={resolveImageSrc(ep.stillPath, 320)}
                              alt={ep.title || `Episode ${ep.episodeNumber}`}
                              fill
                              className="object-cover"
                              sizes="160px"
                              onError={() => onImgError(ep.stillPath!)}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                              <Tv className="h-6 w-6" />
                            </div>
                          )}
                          {inProgress && (
                            <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-white/20">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${Math.max(ep.progress, 2)}%` }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Episode info */}
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white/50">
                              {ep.episodeNumber}
                            </span>
                            <h3 className="truncate text-sm font-medium text-foreground">
                              {ep.title || t("episode", { number: ep.episodeNumber })}
                            </h3>
                            {/* Per-episode personal rating — opens the shared
                                star dialog preloaded with this episode. */}
                            <button
                              onClick={() => setRatingEpisode(ep)}
                              className={`ml-auto flex-shrink-0 inline-flex items-center gap-0.5 text-xs transition-colors cursor-pointer ${
                                ep.personalRating != null && ep.personalRating > 0
                                  ? "text-[var(--gold)] hover:opacity-80"
                                  : "text-white/30 hover:text-[var(--gold)]"
                              }`}
                              title={tMovies("setRating")}
                            >
                              <Star className={`h-4 w-4 ${ep.personalRating != null && ep.personalRating > 0 ? "fill-[var(--gold)]" : ""}`} />
                              {ep.personalRating != null && ep.personalRating > 0 && (
                                <span className="font-semibold">{ep.personalRating.toFixed(1)}</span>
                              )}
                            </button>
                            <button
                              onClick={() => toggleEpisodeWatched.mutate({ episodeId: ep.id, isPlayed: !ep.isPlayed })}
                              className={`flex-shrink-0 transition-colors cursor-pointer ${
                                ep.isPlayed ? "text-green-400" : "text-white/30 hover:text-white/60"
                              }`}
                              title={ep.isPlayed ? t("markUnwatched") : t("markWatched")}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {(ep.runtimeSeconds || ep.runtimeMinutes) && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatRuntime(ep.runtimeSeconds, ep.runtimeMinutes)}
                              </span>
                            )}
                            {ep.airDate && <span>{ep.airDate}</span>}
                          </div>
                          {ep.overview && (
                            <p className="line-clamp-2 text-xs text-white/60">{ep.overview}</p>
                          )}
                          <Link
                            href={`/tv/episodes/${ep.id}/play`}
                            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-black transition-all hover:bg-white"
                          >
                            <Play className="h-3.5 w-3.5 fill-black" />
                            {inProgress ? t("resumeEpisode") : t("playEpisode")}
                          </Link>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex h-32 items-center justify-center text-muted-foreground">
                    {t("noEpisodes")}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Bookmarks Section — aggregated across all episodes */}
          {bookmarks.length > 0 && (() => {
            const landscapeBm = bookmarks.filter((bm) => (bm.thumbnailAspect ?? 1.78) >= 1);
            const portraitBm = bookmarks.filter((bm) => (bm.thumbnailAspect ?? 1.78) < 1);
            // Each aggregated bookmark carries its own episodeId; capture it in
            // the map closure so BookmarkCard's (id) / (id, data) callbacks hit
            // the correct per-episode route.
            const renderBm = (bm: ShowBookmark) => (
              <BookmarkCard
                key={bm.id}
                bookmark={bm}
                playHref={`/tv/episodes/${bm.episodeId}/play?t=${bm.timestampSeconds}${bm.viewState ? `&vs=${bm.viewState.lon.toFixed(2)},${bm.viewState.lat.toFixed(2)},${bm.viewState.fov.toFixed(0)}` : "&vs=off"}`}
                onUpdate={(id, data) => updateBookmark.mutate({ episodeId: bm.episodeId, bookmarkId: id, data })}
                onDelete={(id) => deleteBookmark.mutate({ episodeId: bm.episodeId, bookmarkId: id })}
                customIcons={customIcons}
                disabledIconIds={prefs?.disabledBookmarkIcons}
              />
            );
            return (
              <section className="px-4 md:px-20 mt-4 space-y-2">
                {landscapeBm.length > 0 && (
                  <ScrollRow title={portraitBm.length > 0 ? `${t("bookmarks")} — ${tMovies("landscape")} (${landscapeBm.length})` : `${t("bookmarks")} (${landscapeBm.length})`}>
                    {landscapeBm.map(renderBm)}
                  </ScrollRow>
                )}
                {portraitBm.length > 0 && (
                  <ScrollRow title={landscapeBm.length > 0 ? `${t("bookmarks")} — ${tMovies("portrait")} (${portraitBm.length})` : `${t("bookmarks")} (${portraitBm.length})`}>
                    {portraitBm.map(renderBm)}
                  </ScrollRow>
                )}
              </section>
            );
          })()}

          {/* Cast Section */}
          {(show.cast?.length ?? 0) > 0 && (
            <section className="px-4 md:px-20 mt-8 pb-4">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tMovies("cast")}</h2>
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {show.cast.map((person) => (
                  <PersonCard
                    key={person.id}
                    id={person.id}
                    name={person.name}
                    role={person.role}
                    photoPath={person.photoPath}
                    photoBlur={person.photoBlur}
                    personalRating={person.personalRating}
                    age={person.ageAtRelease}
                    size="movie"
                    // Stay in the TV domain: link to /tv/people and keep the
                    // cinema-only edit/delete menu hidden (readonly) — tv_people
                    // ids must never resolve against the cinema people tables.
                    // The favorite heart still renders (onToggleFavorite) and
                    // PUTs the ISOLATED /api/tv/people endpoint.
                    hrefBase="/tv/people"
                    readonly
                    isFavorite={!!person.isFavorite}
                    onToggleFavorite={() => togglePersonFavorite.mutate({ id: person.id, current: !!person.isFavorite })}
                  />
                ))}
              </div>
            </section>
          )}

          {/* More like this — same-genre shows (current show excluded). */}
          {recommended.length > 0 && (
            <section className="flex flex-col gap-4 px-4 md:px-20 pb-12 pt-4">
              <h2 className="text-xl font-semibold text-foreground">
                {tMovies("youMayAlsoLike")}
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {recommended.map((s) => (
                  <ShowCard
                    key={s.id}
                    id={s.id}
                    title={s.title}
                    year={s.year}
                    posterPath={s.posterPath}
                    posterBlur={s.posterBlur}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Metadata editor dialog */}
      <TvShowMetadataEditor
        showId={showId}
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
      />

      {/* Image editor dialog */}
      <ImageEditorDialog
        open={imageEditorOpen}
        onOpenChange={setImageEditorOpen}
        entityType="tvshow"
        entityId={showId}
        entityName={show.title}
      />

      {/* Personal rating dialog */}
      <StarRatingDialog
        open={ratingOpen}
        onOpenChange={setRatingOpen}
        value={show.userData?.personalRating ?? null}
        onSave={savePersonalRating}
        dimensions={tvShowDimensions}
        dimensionRatings={show.userData?.dimensionRatings}
        dimensionWeights={prefs?.tvShowDimensionWeights}
      />

      {/* Per-episode rating dialog — shares the star dialog; saves back to the
          episode captured in ratingEpisode. */}
      <StarRatingDialog
        open={!!ratingEpisode}
        onOpenChange={(open) => { if (!open) setRatingEpisode(null); }}
        value={ratingEpisode?.personalRating ?? null}
        onSave={saveEpisodeRating}
        dimensions={tvShowDimensions}
        dimensionWeights={prefs?.tvShowDimensionWeights}
      />

      {/* Media info dialog — for the first episode (TV episode media-info). */}
      {firstEpisodeId && (
        <MediaInfoDialog
          movieId={firstEpisodeId}
          apiBase="/api/tv/episodes"
          open={mediaInfoOpen}
          onOpenChange={setMediaInfoOpen}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteFiles(false); }}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("deleteShow")}</DialogTitle>
            <DialogDescription>{t("confirmDeleteShow")}</DialogDescription>
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
                deleteShow.mutate({ deleteFiles });
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
            {tMovies("configureExternalPlayer")}{" "}
            <Link href="/preferences/playback" className="underline font-semibold text-primary hover:text-primary/80">
              {tSettings("playback")}
            </Link>
          </span>
        ) : (
          externalToast
        )}
      </GlassToast>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Play, Heart, CheckCircle, Sparkles, Clock, Tv } from "lucide-react";
import { PersonCard } from "@/components/people/person-card";
import { resolveImageSrc } from "@/lib/image-utils";
import { TiltCard } from "@/components/ui/tilt-card";
import { useHeroParallax } from "@/hooks/use-hero-parallax";
import { useTranslations } from "next-intl";

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
  posterPath?: string | null;
  fanartPath?: string | null;
  seasonCount?: number | null;
  episodeCount?: number | null;
  seasons: SeasonItem[];
  cast: { id: string; name: string; role?: string; photoPath?: string | null; photoBlur?: string | null; personalRating?: number | null; isFavorite?: boolean | null; ageAtRelease?: number | null }[];
  directors: { id: string; name: string }[];
  userData: { isFavorite: boolean; personalRating?: number | null; dimensionRatings?: Record<string, number> | null } | null;
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

export default function ShowDetailPage() {
  const params = useParams();
  const showId = params.id as string;
  const queryClient = useQueryClient();
  const t = useTranslations("tv");
  const tMovies = useTranslations("movies");
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());
  const onImgError = (path: string) => setImgErrors((prev) => new Set(prev).add(path));
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const { data: show } = useQuery<ShowDetail>({
    queryKey: ["tv-show", showId],
    queryFn: () => fetch(`/api/tv/${showId}`).then((r) => r.json()),
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
              </div>

              {/* Badges */}
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
              </div>

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
                    <span className="text-white/90">{show.genres.join(", ")}</span>
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
                    <span className="text-white/90">{show.studios.join(", ")}</span>
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
                            <button
                              onClick={() => toggleEpisodeWatched.mutate({ episodeId: ep.id, isPlayed: !ep.isPlayed })}
                              className={`ml-auto flex-shrink-0 transition-colors cursor-pointer ${
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

          {/* Cast Section */}
          {(show.cast?.length ?? 0) > 0 && (
            <section className="px-4 md:px-20 mt-8 pb-12">
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
                    isFavorite={!!person.isFavorite}
                    age={person.ageAtRelease}
                    size="movie"
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

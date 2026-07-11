"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { Play, Shuffle, Music, ArrowLeft } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { TrackRow } from "@/components/music/track-row";
import { useTranslations } from "next-intl";
import { useMusicPlayer, type PlayerTrack } from "@/providers/music-player-provider";

interface AlbumArtist {
  id: string;
  name: string;
}

interface AlbumTrack {
  id: string;
  title: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  durationSeconds?: number | null;
  artistName?: string;
  isFavorite?: boolean;
  playCount?: number;
}

interface AlbumDetail {
  id: string;
  title: string;
  year?: number | null;
  coverPath?: string | null;
  coverBlur?: string | null;
  genres?: string[];
  artists: AlbumArtist[];
  tracks: AlbumTrack[];
}

export default function AlbumDetailPage() {
  const params = useParams();
  const albumId = params.id as string;
  const t = useTranslations("music");
  const queryClient = useQueryClient();
  const { playAlbum, toggleShuffle, shuffle } = useMusicPlayer();

  const { data: album, isLoading } = useQuery<AlbumDetail>({
    queryKey: ["music-album", albumId],
    queryFn: () => fetch(`/api/music/albums/${albumId}`).then((r) => r.json()),
  });

  const toggleFavorite = useMutation({
    mutationFn: ({ id, current }: { id: string; current: boolean }) =>
      fetch(`/api/music/tracks/${id}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !current }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["music-album", albumId] }),
  });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        {t("title")}…
      </div>
    );
  }

  if (!album || !album.id) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        {t("empty")}
      </div>
    );
  }

  // Build the player queue once; both Play all and per-track clicks reuse it.
  const buildQueue = (): PlayerTrack[] =>
    album.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artistName: track.artistName,
      albumId: album.id,
      albumTitle: album.title,
      coverPath: album.coverPath ?? null,
      coverBlur: album.coverBlur ?? null,
      durationSeconds: track.durationSeconds ?? null,
    }));

  const handlePlayAll = () => {
    const queue = buildQueue();
    if (queue.length > 0) playAlbum(queue, 0);
  };

  const handleShuffle = () => {
    const queue = buildQueue();
    if (queue.length === 0) return;
    if (!shuffle) toggleShuffle();
    playAlbum(queue, 0);
  };

  const genres = album.genres ?? [];

  return (
    <div className="h-full overflow-y-scroll px-4 md:px-12">
      <div className="animate-fade-in-up mx-auto max-w-5xl py-6">
        {/* Back link */}
        <Link
          href="/music"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("albums")}
        </Link>

        {/* Hero: cover + metadata */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end">
          {/* Cover with ambient blur glow behind it */}
          <div className="relative mx-auto h-[240px] w-[240px] flex-shrink-0 md:mx-0 md:h-[280px] md:w-[280px]">
            {album.coverBlur && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-lg bg-cover bg-center opacity-45 blur-[28px] saturate-[1.4]"
                style={{ backgroundImage: `url(${album.coverBlur})` }}
              />
            )}
            <div className="relative h-full w-full overflow-hidden rounded-lg bg-[var(--surface)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
              {album.coverPath ? (
                <Image
                  src={resolveImageSrc(album.coverPath, 560)}
                  alt={album.title}
                  fill
                  className="object-cover"
                  sizes="280px"
                  priority
                  {...(album.coverBlur ? { placeholder: "blur" as const, blurDataURL: album.coverBlur } : {})}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                  <Music className="h-10 w-10" />
                  <span className="text-xs">{t("noCover")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <h1 className="text-2xl font-bold text-foreground md:text-4xl">{album.title}</h1>

            {album.artists.length > 0 && (
              <p className="text-base text-muted-foreground">
                {album.artists.map((artist, i) => (
                  <span key={artist.id}>
                    {i > 0 && ", "}
                    <Link
                      href={`/music/artists/${artist.id}`}
                      className="transition-colors hover:text-foreground hover:underline"
                    >
                      {artist.name}
                    </Link>
                  </span>
                ))}
              </p>
            )}

            {/* Year · track count */}
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              {album.year && <span>{album.year}</span>}
              {album.year && <span className="text-white/30">·</span>}
              <span>{t("trackCount", { count: album.tracks.length })}</span>
            </div>

            {/* Genre chips */}
            {genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {genres.map((genre) => (
                  <span
                    key={genre}
                    className="glass-badge rounded-md px-2.5 py-1 text-xs font-medium text-white/90"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={handlePlayAll}
                disabled={album.tracks.length === 0}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/90 px-6 py-2.5 text-base font-semibold text-black shadow-lg shadow-white/10 transition-all hover:bg-white hover:shadow-white/20 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <Play className="h-5 w-5 fill-black" />
                {t("playAll")}
              </button>
              <button
                onClick={handleShuffle}
                disabled={album.tracks.length === 0}
                className="glass-btn flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-medium text-white/90 transition-all disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <Shuffle className="h-5 w-5" />
                {t("shuffle")}
              </button>
            </div>
          </div>
        </div>

        {/* Track list */}
        <div className="mt-8 flex flex-col">
          {album.tracks.map((track, index) => (
            <TrackRow
              key={track.id}
              id={track.id}
              trackNumber={track.trackNumber}
              index={index}
              title={track.title}
              artistName={track.artistName}
              durationSeconds={track.durationSeconds}
              isFavorite={track.isFavorite}
              onPlay={() => playAlbum(buildQueue(), index)}
              onToggleFavorite={() => toggleFavorite.mutate({ id: track.id, current: !!track.isFavorite })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

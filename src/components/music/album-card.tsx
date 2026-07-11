"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Music } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import { TiltCard } from "@/components/ui/tilt-card";
import { useMusicPlayer } from "@/providers/music-player-provider";

interface AlbumCardProps {
  id: string;
  title: string;
  artistName?: string;
  coverPath?: string | null;
  coverBlur?: string | null;
  year?: number | null;
  responsive?: boolean;
  /** LCP hint — pass for the first ~10 above-the-fold cards so the cover
   *  loads eagerly with fetchpriority=high instead of lazy. */
  priority?: boolean;
}

/** A track as passed to the player. Mirrors the shape the player expects. */
interface PlayerTrack {
  id: string;
  title: string;
  artistName?: string;
  albumId?: string;
  albumTitle?: string;
  coverPath?: string | null;
  coverBlur?: string | null;
  durationSeconds?: number | null;
}

export function AlbumCard({
  id,
  title,
  artistName,
  coverPath,
  coverBlur,
  year,
  responsive,
  priority,
}: AlbumCardProps) {
  const t = useTranslations("music");
  const { playAlbum } = useMusicPlayer();
  const [imgError, setImgError] = useState(false);

  // Fetch the album's tracks and hand them to the player. Resilient — a failed
  // fetch just leaves playback untouched.
  const handlePlay = async () => {
    try {
      const res = await fetch(`/api/music/albums/${id}`).then((r) => r.json());
      const tracks: PlayerTrack[] = (res.tracks ?? []).map((track: {
        id: string;
        title: string;
        artistName?: string;
        durationSeconds?: number | null;
      }) => ({
        id: track.id,
        title: track.title,
        artistName: track.artistName ?? artistName,
        albumId: id,
        albumTitle: title,
        coverPath: coverPath ?? null,
        coverBlur: coverBlur ?? null,
        durationSeconds: track.durationSeconds ?? null,
      }));
      if (tracks.length > 0) playAlbum(tracks, 0);
    } catch {
      // ignore — playback stays as-is
    }
  };

  return (
    <div
      className={`group flex-shrink-0 transition-[scale] duration-200 ease-out hover:scale-[1.03] ${responsive ? "w-full" : ""}`}
      style={responsive ? undefined : { width: 180 }}
    >
      <Link href={`/music/albums/${id}`} className="focus-ring block rounded-md">

        {/* Cover shell — NOT overflow-hidden so tilt + ambient glow can bleed.
            The tilting subtree (cover + play button) is wrapped in TiltCard so
            it all tilts as one object; the play overlay uses no backdrop-blur
            (preserve-3d breaks backdrop-filter on descendants in Chromium). */}
        <div className="relative aspect-square w-full">
          {/* Ambient glow (ambilight) — blurred cover bleeding behind, hover-only */}
          {coverBlur && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-md bg-cover bg-center opacity-0 blur-[24px] saturate-150 transition-fluid group-hover:opacity-55"
              style={{ backgroundImage: `url(${coverBlur})` }}
            />
          )}

          <TiltCard className="h-full w-full">
            <div className="relative h-full w-full overflow-hidden rounded-md bg-[var(--surface)] ring-1 ring-white/[0.06]">
              {coverPath && !imgError ? (
                <Image
                  src={resolveImageSrc(coverPath, 360)}
                  alt={title}
                  fill
                  className="object-cover transition-fluid"
                  sizes="180px"
                  priority={priority}
                  onError={() => setImgError(true)}
                  {...(coverBlur ? { placeholder: "blur" as const, blurDataURL: coverBlur } : {})}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                  <Music className="h-8 w-8" />
                  <span className="text-xs">{t("noCover")}</span>
                </div>
              )}

              {/* Centered play button on hover — floats highest on tilt.
                  The overlay spans the whole card (inset-0) and is lifted toward
                  the viewer via translateZ so it sits in front in preserve-3d
                  space. Pointer-transparent except the button itself. */}
              <div
                className="tilt-lift pointer-events-none absolute inset-0 z-[5] flex items-center justify-center transition-fluid scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100"
                style={{ "--tilt-lift": "40px" } as React.CSSProperties}
              >
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePlay();
                  }}
                  aria-label={t("play")}
                  className="focus-ring glass-btn pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full text-white/90 transition-fluid hover:scale-120 active:scale-95"
                >
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                </button>
              </div>
            </div>
          </TiltCard>
        </div>

        {/* Title & artist below cover */}
        <div className="mt-1.5 px-0.5 text-center">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {artistName ? (
            <p className="truncate text-xs text-muted-foreground">{artistName}</p>
          ) : year ? (
            <p className="text-xs text-muted-foreground">{year}</p>
          ) : null}
        </div>
      </Link>
    </div>
  );
}

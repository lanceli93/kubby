"use client";

import Image from "next/image";
import { Heart, Play, Music } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import { useMusicPlayer } from "@/providers/music-player-provider";

interface TrackRowProps {
  id: string;
  /** Zero-based position in a list — used for numbering when trackNumber is absent. */
  index?: number;
  trackNumber?: number | null;
  title: string;
  artistName?: string;
  durationSeconds?: number | null;
  isFavorite?: boolean;
  coverPath?: string | null;
  coverBlur?: string | null;
  albumTitle?: string;
  albumId?: string;
  /** Show a small cover thumbnail instead of the track number (Songs tab). */
  showCover?: boolean;
  onPlay?: () => void;
  onToggleFavorite?: () => void;
  /** Optional actions slot (e.g. the ⋯ edit/delete menu), shown after duration. */
  menu?: React.ReactNode;
}

/** Format seconds as m:ss; null/invalid → "--:--". */
function formatDuration(sec?: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "--:--";
  const total = Math.floor(sec);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function TrackRow({
  id,
  index,
  trackNumber,
  title,
  artistName,
  durationSeconds,
  isFavorite,
  coverPath,
  coverBlur,
  showCover,
  onPlay,
  onToggleFavorite,
  menu,
}: TrackRowProps) {
  const t = useTranslations("music");
  const { currentTrackId, isPlaying } = useMusicPlayer();
  const isCurrent = currentTrackId === id;

  const displayNumber = trackNumber ?? (index != null ? index + 1 : null);

  return (
    <div
      onClick={() => onPlay?.()}
      className="group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]"
    >
      {/* Left: cover thumb (Songs tab) OR track number that flips to a play
          triangle on hover; when this is the current track show an equalizer. */}
      {showCover ? (
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-[var(--surface)] ring-1 ring-white/[0.06]">
          {coverPath ? (
            <Image
              src={resolveImageSrc(coverPath, 80)}
              alt={title}
              fill
              className="object-cover"
              sizes="40px"
              {...(coverBlur ? { placeholder: "blur" as const, blurDataURL: coverBlur } : {})}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Music className="h-4 w-4" />
            </div>
          )}
        </div>
      ) : (
        <div className="w-6 flex-shrink-0 text-center">
          {isCurrent ? (
            <PlayingIndicator active={isPlaying} />
          ) : (
            <>
              <span className="text-sm tabular-nums text-muted-foreground group-hover:hidden">
                {displayNumber ?? "-"}
              </span>
              <Play className="mx-auto hidden h-4 w-4 fill-current text-foreground group-hover:block" />
            </>
          )}
        </div>
      )}

      {/* Middle: title + artist */}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${isCurrent ? "text-primary" : "text-foreground"}`}>
          {title}
        </p>
        {artistName && (
          <p className="truncate text-xs text-muted-foreground">{artistName}</p>
        )}
      </div>

      {/* Right: favorite heart (hover-only unless favorited) + duration */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={t("favorite")}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/10 active:scale-95 ${
              isFavorite ? "text-red-400" : "text-white/70 opacity-0 group-hover:opacity-100"
            }`}
          >
            <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-400" : ""}`} />
          </button>
        )}
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          {formatDuration(durationSeconds)}
        </span>
        {menu && (
          <div onClick={(e) => e.stopPropagation()}>{menu}</div>
        )}
      </div>
    </div>
  );
}

/** Three bars pumping while the current track plays; frozen when paused. */
function PlayingIndicator({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="mx-auto flex h-4 items-end justify-center gap-0.5">
      {[0, 0.3, 0.15].map((delay, i) => (
        <span
          key={i}
          className={`w-0.5 rounded-sm bg-primary ${active ? "music-eq-bar" : ""}`}
          style={{ height: "100%", animationDelay: `${delay}s`, transform: active ? undefined : "scaleY(0.5)", transformOrigin: "bottom" }}
        />
      ))}
    </div>
  );
}

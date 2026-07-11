"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ChevronDown,
  Maximize2,
  Music,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { resolveImageSrc } from "@/lib/image-utils";
import { useMusicPlayer } from "@/providers/music-player-provider";
import { TrackRow } from "@/components/music/track-row";

/** Format seconds as m:ss; null/invalid → "0:00". */
function formatDuration(sec?: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * NowPlayingBar — fixed glass transport docked at the bottom, above the mobile
 * BottomTabs. Returns null when nothing is playing. Clicking the cover/title
 * opens the full-screen Now Playing overlay.
 */
export function NowPlayingBar() {
  const t = useTranslations("music");
  const player = useMusicPlayer();
  const [expanded, setExpanded] = useState(false);

  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    shuffle,
    repeat,
    queue,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
  } = player;

  if (!currentTrack) return null;

  const cover = currentTrack.coverPath;
  const coverBlur = currentTrack.coverBlur;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const VolIcon = volume === 0 ? VolumeX : Volume2;

  return (
    <>
      {/* ── Docked bar ── */}
      <div className="fixed bottom-14 left-0 right-0 z-40 border-t border-white/[0.08] bg-[#0a0a0f]/80 backdrop-blur-2xl md:bottom-0">
        {/* Mobile-only thin progress line at the very top of the bar */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-white/10 md:hidden">
          <div
            className="h-full bg-primary transition-[width] duration-150 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 px-3 md:h-20 md:gap-4 md:px-4">
          {/* Left: cover + title/artist — opens the full-screen overlay */}
          <button
            onClick={() => setExpanded(true)}
            aria-label={t("nowPlaying")}
            className="flex min-w-0 flex-1 items-center gap-3 text-left transition-fluid active:scale-95 md:flex-none md:w-64 lg:w-72"
          >
            <Cover cover={cover} coverBlur={coverBlur} title={currentTrack.title} size={48} rounded="rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{currentTrack.title}</p>
              {currentTrack.artistName && (
                <p className="truncate text-xs text-muted-foreground">{currentTrack.artistName}</p>
              )}
            </div>
          </button>

          {/* Center: transport + seek (desktop) */}
          <div className="hidden flex-1 flex-col items-center gap-1.5 md:flex">
            <div className="flex items-center gap-4">
              <IconBtn label={t("shuffle")} onClick={toggleShuffle} active={shuffle}>
                <Shuffle className="h-4 w-4" />
              </IconBtn>
              <IconBtn label={t("previous")} onClick={prev}>
                <SkipBack className="h-5 w-5 fill-current" />
              </IconBtn>
              <button
                onClick={toggle}
                aria-label={isPlaying ? t("pause") : t("play")}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-fluid hover:scale-110 active:scale-95"
              >
                {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-[1px] fill-current" />}
              </button>
              <IconBtn label={t("next")} onClick={next}>
                <SkipForward className="h-5 w-5 fill-current" />
              </IconBtn>
              <IconBtn
                label={repeat === "one" ? t("repeatOne") : t("repeat")}
                onClick={cycleRepeat}
                active={repeat !== "off"}
              >
                <RepeatIcon className="h-4 w-4" />
              </IconBtn>
            </div>
            <div className="flex w-full max-w-xl items-center gap-2">
              <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">
                {formatDuration(currentTime)}
              </span>
              <SeekBar progress={progress} duration={duration} onSeek={seek} label={t("duration")} />
              <span className="w-10 text-[11px] tabular-nums text-muted-foreground">
                {formatDuration(duration)}
              </span>
            </div>
          </div>

          {/* Right: volume (desktop) + mobile play/pause + expand */}
          <div className="flex flex-shrink-0 items-center gap-2 md:w-64 md:justify-end lg:w-72">
            <div className="hidden items-center gap-2 md:flex">
              <VolIcon className="h-4 w-4 text-muted-foreground" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                aria-label={t("volume")}
                className="music-range h-1 w-24 cursor-pointer"
                style={{ "--fill": `${volume * 100}%` } as React.CSSProperties}
              />
            </div>

            {/* Mobile play/pause */}
            <button
              onClick={toggle}
              aria-label={isPlaying ? t("pause") : t("play")}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-foreground transition-fluid active:scale-95 md:hidden"
            >
              {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 translate-x-[1px] fill-current" />}
            </button>

            <IconBtn label={t("expand")} onClick={() => setExpanded(true)} className="hidden md:flex">
              <Maximize2 className="h-4 w-4" />
            </IconBtn>
          </div>
        </div>
      </div>

      {/* ── Full-screen Now Playing overlay ── */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#07070b] animate-fade-in-up">
          {/* Ambient glow from the cover blur */}
          {coverBlur && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 scale-125 bg-cover bg-center opacity-40 blur-[80px] saturate-150"
              style={{ backgroundImage: `url(${coverBlur})` }}
            />
          )}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-black/40" />

          {/* Top bar: collapse + label */}
          <div className="flex flex-shrink-0 items-center justify-between px-4 py-4 md:px-8">
            <button
              onClick={() => setExpanded(false)}
              aria-label={t("collapse")}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-foreground transition-fluid hover:bg-white/10 active:scale-95"
            >
              <ChevronDown className="h-6 w-6" />
            </button>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("nowPlaying")}
            </span>
            <span className="h-10 w-10" aria-hidden />
          </div>

          {/* Body: cover + meta + transport, and (desktop) queue on the side */}
          <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-8 md:flex-row md:items-center md:justify-center md:gap-16 md:px-12">
            <div className="flex flex-col items-center gap-6 md:max-w-md md:flex-1">
              <Cover
                cover={cover}
                coverBlur={coverBlur}
                title={currentTrack.title}
                size={320}
                rounded="rounded-2xl"
                className="aspect-square w-full max-w-[min(80vw,340px)] shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
                sizes="340px"
              />

              <div className="w-full text-center">
                <h2 className="truncate text-2xl font-semibold text-foreground">{currentTrack.title}</h2>
                {currentTrack.artistName && (
                  <p className="mt-1 truncate text-base text-muted-foreground">{currentTrack.artistName}</p>
                )}
                {currentTrack.albumTitle && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground/70">{currentTrack.albumTitle}</p>
                )}
              </div>

              {/* Seek */}
              <div className="flex w-full max-w-md items-center gap-3">
                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                  {formatDuration(currentTime)}
                </span>
                <SeekBar progress={progress} duration={duration} onSeek={seek} label={t("duration")} />
                <span className="w-10 text-xs tabular-nums text-muted-foreground">
                  {formatDuration(duration)}
                </span>
              </div>

              {/* Transport */}
              <div className="flex items-center gap-6">
                <IconBtn label={t("shuffle")} onClick={toggleShuffle} active={shuffle} size="lg">
                  <Shuffle className="h-5 w-5" />
                </IconBtn>
                <IconBtn label={t("previous")} onClick={prev} size="lg">
                  <SkipBack className="h-7 w-7 fill-current" />
                </IconBtn>
                <button
                  onClick={toggle}
                  aria-label={isPlaying ? t("pause") : t("play")}
                  className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-fluid hover:scale-110 active:scale-95"
                >
                  {isPlaying ? <Pause className="h-8 w-8 fill-current" /> : <Play className="h-8 w-8 translate-x-[2px] fill-current" />}
                </button>
                <IconBtn label={t("next")} onClick={next} size="lg">
                  <SkipForward className="h-7 w-7 fill-current" />
                </IconBtn>
                <IconBtn
                  label={repeat === "one" ? t("repeatOne") : t("repeat")}
                  onClick={cycleRepeat}
                  active={repeat !== "off"}
                  size="lg"
                >
                  <RepeatIcon className="h-5 w-5" />
                </IconBtn>
              </div>

              {/* Volume */}
              <div className="flex w-full max-w-md items-center gap-3">
                <button
                  onClick={() => setVolume(volume === 0 ? 1 : 0)}
                  aria-label={volume === 0 ? t("volume") : t("mute")}
                  className="flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-fluid hover:bg-white/10 active:scale-95"
                >
                  <VolIcon className="h-5 w-5" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label={t("volume")}
                  className="music-range h-1 flex-1 cursor-pointer"
                  style={{ "--fill": `${volume * 100}%` } as React.CSSProperties}
                />
              </div>
            </div>

            {/* Queue (if more than one track) */}
            {queue.length > 1 && (
              <div className="flex min-h-0 w-full flex-col md:max-w-sm md:flex-1">
                <p className="mb-2 flex-shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("queue")}
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto md:max-h-[60vh]">
                  {queue.map((track, i) => (
                    <TrackRow
                      key={`${track.id}-${i}`}
                      id={track.id}
                      index={i}
                      title={track.title}
                      artistName={track.artistName}
                      durationSeconds={track.durationSeconds}
                      coverPath={track.coverPath}
                      coverBlur={track.coverBlur}
                      showCover
                      onPlay={() => player.playAlbum(queue, i)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Cover thumbnail with blur placeholder + Music-icon fallback. */
function Cover({
  cover,
  coverBlur,
  title,
  size,
  rounded,
  className,
  sizes,
}: {
  cover?: string | null;
  coverBlur?: string | null;
  title: string;
  size: number;
  rounded: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <div
      className={`relative flex-shrink-0 overflow-hidden bg-[var(--surface)] ring-1 ring-white/[0.06] ${rounded} ${className ?? ""}`}
      style={className ? undefined : { width: size, height: size }}
    >
      {cover ? (
        <Image
          src={resolveImageSrc(cover, size * 2)}
          alt={title}
          fill
          className="object-cover"
          sizes={sizes ?? `${size}px`}
          {...(coverBlur ? { placeholder: "blur" as const, blurDataURL: coverBlur } : {})}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Music className="h-1/3 w-1/3" />
        </div>
      )}
    </div>
  );
}

/** A muted icon button that tints primary when `active`. */
function IconBtn({
  label,
  onClick,
  active,
  size = "md",
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  size?: "md" | "lg";
  className?: string;
  children: React.ReactNode;
}) {
  const dim = size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex ${dim} cursor-pointer items-center justify-center rounded-full transition-fluid hover:bg-white/10 active:scale-95 ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      } ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

/**
 * SeekBar — a clickable/draggable progress track. Uses a native range input
 * (overlaid, transparent) for keyboard + drag accessibility, with a painted
 * fill underneath.
 */
function SeekBar({
  progress,
  duration,
  onSeek,
  label,
}: {
  progress: number;
  duration: number;
  onSeek: (seconds: number) => void;
  label: string;
}) {
  return (
    <input
      type="range"
      min={0}
      max={duration > 0 ? duration : 0}
      step={0.1}
      value={progress * (duration > 0 ? duration : 0)}
      onChange={(e) => onSeek(Number(e.target.value))}
      aria-label={label}
      disabled={duration <= 0}
      className="music-range h-1 flex-1 cursor-pointer"
      style={{ "--fill": `${progress * 100}%` } as React.CSSProperties}
    />
  );
}

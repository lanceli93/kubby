"use client";

import { useEffect, useRef, useState } from "react";
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
  Heart,
  ListMusic,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveImageSrc } from "@/lib/image-utils";
import { extractAmbientColor } from "@/lib/ambient-color";
import { useMusicPlayer } from "@/providers/music-player-provider";
import { TrackRow } from "@/components/music/track-row";
import { LyricsView } from "@/components/music/lyrics-view";
import { VinylDisc } from "@/components/music/vinyl-disc";
import { AudioSpectrum } from "@/components/music/audio-spectrum";

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
  // MOBILE-ONLY: the top segmented control switches these. Desktop shows the
  // vinyl + lyrics side by side and no longer uses `panel`.
  const [panel, setPanel] = useState<"lyrics" | "queue">("lyrics");
  // Mobile only: which region is on screen (the side panel shows `panel`).
  const [mobileView, setMobileView] = useState<"cover" | "panel">("cover");
  // DESKTOP-ONLY: whether the right-side queue drawer is open.
  const [queueOpen, setQueueOpen] = useState(false);
  // Dominant album colour driving the adaptive glow + spectrum bar tint. Null
  // (grayscale/SSR/extraction failure) falls back to --primary.
  const [glow, setGlow] = useState<[number, number, number] | null>(null);

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
    stop,
  } = player;

  // Ease the ambient glow toward the current album's dominant hue; re-runs
  // when the track (its blur) changes. Mirrors home-hero.tsx:237-246 — state is
  // only set from the async callback so no synchronous cascade fires. A track
  // with no blur simply keeps `extractAmbientColor` from resolving a colour.
  const trackCoverBlur = currentTrack?.coverBlur;
  useEffect(() => {
    if (!trackCoverBlur) return;
    let cancelled = false;
    extractAmbientColor(trackCoverBlur).then((rgb) => {
      if (rgb && !cancelled) setGlow(rgb);
    });
    return () => {
      cancelled = true;
    };
  }, [trackCoverBlur]);

  if (!currentTrack) return null;

  // Close the player: stop playback + clear the queue (this unmounts the bar)
  // and drop the expanded flag so a future track doesn't reopen the overlay.
  const closePlayer = () => {
    setExpanded(false);
    stop();
  };

  const cover = currentTrack.coverPath;
  const coverBlur = currentTrack.coverBlur;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  const VolIcon = volume === 0 ? VolumeX : Volume2;

  // Adaptive glow colour + spectrum tint; --primary when extraction returns null.
  const glowColor = glow ? `rgb(${glow[0]} ${glow[1]} ${glow[2]})` : undefined;
  const spectrumColor = glowColor ?? "var(--primary)";

  return (
    <>
      {/* ── Docked bar ── */}
      <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 border-t border-white/[0.08] bg-[#0a0a0f]/80 backdrop-blur-2xl md:bottom-0">
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
            className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-md text-left transition-fluid active:scale-95 md:flex-none md:w-64 lg:w-72"
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
                className="focus-ring flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-fluid hover:scale-110 active:scale-95"
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
              className="focus-ring flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-foreground transition-fluid active:scale-95 md:hidden"
            >
              {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 translate-x-[1px] fill-current" />}
            </button>

            <IconBtn label={t("expand")} onClick={() => setExpanded(true)} className="hidden md:flex">
              <Maximize2 className="h-4 w-4" />
            </IconBtn>

            {/* Close the player — stops playback and dismisses the bar. */}
            <button
              onClick={closePlayer}
              aria-label={t("closePlayer")}
              className="focus-ring flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-fluid hover:bg-white/10 hover:text-foreground active:scale-95"
            >
              <X className="h-4 w-4 md:h-[18px] md:w-[18px]" />
            </button>
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
          {/* Adaptive hue wash — a dim halo tinted to the album's dominant colour,
              fading smoothly when the track (and colour) changes. */}
          {glowColor && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 opacity-40 transition-[background] duration-700"
              style={{ background: `radial-gradient(60% 60% at 50% 40%, ${glowColor}, transparent 70%)` }}
            />
          )}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-black/45" />

          {/* Top bar: collapse + label + (mobile) segmented view switch. Top
              padding folds in the notch inset so the collapse button clears it. */}
          <div className="flex flex-shrink-0 items-center justify-between gap-3 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] md:px-8">
            <button
              onClick={() => setExpanded(false)}
              aria-label={t("collapse")}
              className="focus-ring flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-fluid hover:bg-white/10 active:scale-95"
            >
              <ChevronDown className="h-6 w-6" />
            </button>

            {/* Mobile: 封面 vs 歌词/队列 panel switch. Tapping 歌词 or 队列
                both flips to the panel and selects that content. */}
            <div className="md:hidden">
              <Segmented
                value={mobileView === "cover" ? "cover" : panel}
                onChange={(v) => {
                  if (v === "cover") setMobileView("cover");
                  else {
                    setPanel(v);
                    setMobileView("panel");
                  }
                }}
                options={[
                  { value: "cover", label: t("nowPlaying") },
                  { value: "lyrics", label: t("lyrics") },
                  { value: "queue", label: t("queue") },
                ]}
              />
            </div>
            {/* Desktop: static label */}
            <span className="hidden text-xs font-medium uppercase tracking-wider text-muted-foreground md:block">
              {t("nowPlaying")}
            </span>

            {/* Close the player entirely (stops playback, dismisses the bar). */}
            <button
              onClick={closePlayer}
              aria-label={t("closePlayer")}
              className="focus-ring flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-fluid hover:bg-white/10 active:scale-95"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Body — a column: a content row that grows (vinyl + lyrics on
              desktop; segmented cover/panel on mobile) over a full-width bottom
              transport bar (desktop) / mobile mini transport. */}
          <div className="flex min-h-0 flex-1 flex-col">
            {/* ── Content row ── */}
            <div className="flex min-h-0 flex-1 md:flex-row md:items-stretch md:gap-12 md:px-12 md:pb-6">
              {/* Left half (desktop) / cover view (mobile): vinyl + spectrum + meta.
                  On mobile this pane also carries the seek/transport/volume that the
                  desktop bottom bar owns. */}
              <div
                className={`min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 pb-8 md:flex md:px-0 md:pb-0 ${
                  mobileView === "cover" ? "flex" : "hidden"
                }`}
              >
                <VinylDisc
                  cover={cover}
                  coverBlur={coverBlur}
                  title={currentTrack.title}
                  isPlaying={isPlaying}
                  className="w-full max-w-[72vw] md:max-w-[min(48vh,420px)]"
                />

                {/* Compact spectrum under the vinyl on mobile; the desktop bottom
                    bar has its own wider spectrum. */}
                <AudioSpectrum className="h-8 w-full max-w-xs md:hidden" color={spectrumColor} />

                <div className="w-full text-center">
                  <h2 className="truncate text-2xl font-semibold text-foreground">{currentTrack.title}</h2>
                  {currentTrack.artistName && (
                    <p className="mt-1 truncate text-base text-muted-foreground">{currentTrack.artistName}</p>
                  )}
                  {currentTrack.albumTitle && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground/70">{currentTrack.albumTitle}</p>
                  )}
                </div>

                {/* Mobile-only seek + transport + volume (desktop uses the bottom
                    bar). */}
                <div className="flex w-full max-w-md items-center gap-3 md:hidden">
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {formatDuration(currentTime)}
                  </span>
                  <SeekBar progress={progress} duration={duration} onSeek={seek} label={t("duration")} />
                  <span className="w-10 text-xs tabular-nums text-muted-foreground">
                    {formatDuration(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-6 md:hidden">
                  <IconBtn label={t("shuffle")} onClick={toggleShuffle} active={shuffle} size="lg">
                    <Shuffle className="h-5 w-5" />
                  </IconBtn>
                  <IconBtn label={t("previous")} onClick={prev} size="lg">
                    <SkipBack className="h-7 w-7 fill-current" />
                  </IconBtn>
                  <button
                    onClick={toggle}
                    aria-label={isPlaying ? t("pause") : t("play")}
                    className="focus-ring flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-fluid hover:scale-110 active:scale-95"
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

                <div className="flex w-full max-w-md items-center gap-3 md:hidden">
                  <button
                    onClick={() => setVolume(volume === 0 ? 1 : 0)}
                    aria-label={volume === 0 ? t("volume") : t("mute")}
                    className="focus-ring flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-fluid hover:bg-white/10 active:scale-95"
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

              {/* Right half: lyrics (desktop) / segmented panel (mobile). Desktop
                  is lyrics-only now — the queue moved to the drawer. */}
              <div
                className={`min-h-0 flex-1 flex-col md:flex ${
                  mobileView === "panel" ? "flex" : "hidden"
                }`}
              >
                {/* Content — bounded; scrolls WITHIN itself only. Desktop always
                    shows lyrics; mobile obeys the top segmented `panel`. */}
                <div className="min-h-0 flex-1">
                  {panel === "lyrics" ? (
                    <LyricsView
                      align="left"
                      trackId={currentTrack.id}
                      currentTime={currentTime}
                      onSeek={seek}
                    />
                  ) : queue.length > 0 ? (
                    <div className="mx-auto h-full max-w-lg overflow-y-auto px-1">
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
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      {t("queue")}
                    </div>
                  )}
                </div>

                {/* Mobile mini transport so lyrics/queue panes stay controllable.
                    Bottom padding folds in the home-indicator inset. */}
                <div className="flex flex-shrink-0 items-center gap-3 border-t border-white/[0.06] px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
                  <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
                    {formatDuration(currentTime)}
                  </span>
                  <SeekBar progress={progress} duration={duration} onSeek={seek} label={t("duration")} />
                  <span className="w-9 text-[11px] tabular-nums text-muted-foreground">
                    {formatDuration(duration)}
                  </span>
                  <IconBtn label={t("previous")} onClick={prev}>
                    <SkipBack className="h-5 w-5 fill-current" />
                  </IconBtn>
                  <button
                    onClick={toggle}
                    aria-label={isPlaying ? t("pause") : t("play")}
                    className="focus-ring flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-fluid active:scale-95"
                  >
                    {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-[1px] fill-current" />}
                  </button>
                  <IconBtn label={t("next")} onClick={next}>
                    <SkipForward className="h-5 w-5 fill-current" />
                  </IconBtn>
                </div>
              </div>
            </div>

            {/* ── Desktop bottom transport bar ── full width, three clusters:
                info + heart · spectrum/transport/seek · volume + playlist. */}
            <div className="hidden flex-shrink-0 items-center gap-4 border-t border-white/[0.06] px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:flex lg:px-10">
              {/* Left: mini cover + title/artist + favorite heart */}
              <div className="flex w-1/4 min-w-0 items-center gap-3">
                <Cover
                  cover={cover}
                  coverBlur={coverBlur}
                  title={currentTrack.title}
                  size={48}
                  rounded="rounded-full"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{currentTrack.title}</p>
                  {currentTrack.artistName && (
                    <p className="truncate text-xs text-muted-foreground">{currentTrack.artistName}</p>
                  )}
                </div>
                <FavoriteHeart trackId={currentTrack.id} />
              </div>

              {/* Center: spectrum + transport + long seek */}
              <div className="flex flex-1 flex-col items-center gap-2">
                <AudioSpectrum className="h-10 w-full max-w-xl" color={spectrumColor} />
                <div className="flex items-center gap-6">
                  <IconBtn label={t("shuffle")} onClick={toggleShuffle} active={shuffle}>
                    <Shuffle className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn label={t("previous")} onClick={prev}>
                    <SkipBack className="h-5 w-5 fill-current" />
                  </IconBtn>
                  <button
                    onClick={toggle}
                    aria-label={isPlaying ? t("pause") : t("play")}
                    className="focus-ring flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-black transition-fluid hover:scale-110 active:scale-95"
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
                <div className="flex w-full max-w-2xl items-center gap-3">
                  <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">
                    {formatDuration(currentTime)}
                  </span>
                  <SeekBar progress={progress} duration={duration} onSeek={seek} label={t("duration")} />
                  <span className="w-10 text-[11px] tabular-nums text-muted-foreground">
                    {formatDuration(duration)}
                  </span>
                </div>
              </div>

              {/* Right: volume popover + playlist (queue drawer) toggle */}
              <div className="flex w-1/4 items-center justify-end gap-2">
                <VolumePopover
                  volume={volume}
                  setVolume={setVolume}
                  VolIcon={VolIcon}
                  volumeLabel={t("volume")}
                  muteLabel={t("mute")}
                />
                <IconBtn
                  label={t("queue")}
                  onClick={() => setQueueOpen((v) => !v)}
                  active={queueOpen}
                >
                  <ListMusic className="h-5 w-5" />
                </IconBtn>
              </div>
            </div>
          </div>

          {/* ── Desktop queue drawer ── right-anchored, below the top bar so it
              never covers the collapse/close buttons. Desktop-only. Frosted
              glass mirrors the homepage NavSidebar drawer (nav-sidebar.tsx):
              a dimming blur scrim + a translucent blurred panel with an inset
              edge highlight. */}
          {queueOpen && (
            <div
              onClick={() => setQueueOpen(false)}
              aria-hidden
              className="absolute inset-x-0 bottom-0 z-40 hidden bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:block"
              style={{ top: "calc(64px + env(safe-area-inset-top))" }}
            />
          )}
          {queueOpen && (
            <div
              className="absolute right-0 bottom-0 z-50 hidden w-full max-w-sm animate-slide-in-right flex-col border-l border-white/[0.08] bg-[#0a0a0f]/70 shadow-[inset_0.5px_0_0_rgba(255,255,255,0.06)] backdrop-blur-2xl md:flex"
              style={{ top: "calc(64px + env(safe-area-inset-top))" }}
            >
              <div className="flex flex-shrink-0 items-center justify-between px-5 py-4">
                <span className="text-sm font-medium text-foreground">{t("queue")}</span>
                <button
                  onClick={() => setQueueOpen(false)}
                  aria-label={t("collapse")}
                  className="focus-ring flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-fluid hover:bg-white/10 hover:text-foreground active:scale-95"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                {queue.length > 0 ? (
                  queue.map((track, i) => (
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
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {t("queue")}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Segmented — a small pill switcher (iOS-style). Highlights the active option.
 */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] p-1 backdrop-blur-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`focus-ring cursor-pointer rounded-full px-3.5 py-1 text-[13px] font-medium transition-fluid active:scale-95 ${
            value === opt.value
              ? "bg-white text-black"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
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
      className={`focus-ring flex ${dim} cursor-pointer items-center justify-center rounded-full transition-fluid hover:bg-white/10 active:scale-95 ${
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

/**
 * VolumePopover — a volume IconBtn that toggles a small panel above it holding
 * the volume slider. Closes on outside click (a document mousedown listener).
 */
function VolumePopover({
  volume,
  setVolume,
  VolIcon,
  volumeLabel,
  muteLabel,
}: {
  volume: number;
  setVolume: (v: number) => void;
  VolIcon: typeof Volume2;
  volumeLabel: string;
  muteLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <IconBtn label={volume === 0 ? muteLabel : volumeLabel} onClick={() => setOpen((v) => !v)} active={open}>
        <VolIcon className="h-5 w-5" />
      </IconBtn>
      {open && (
        <div className="absolute bottom-full right-0 mb-2 rounded-lg border border-white/[0.08] bg-[#0a0a0f]/90 p-3 backdrop-blur-xl">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label={volumeLabel}
            className="music-range h-1 w-32 cursor-pointer"
            style={{ "--fill": `${volume * 100}%` } as React.CSSProperties}
          />
        </div>
      )}
    </div>
  );
}

/**
 * FavoriteHeart — reads/toggles the current track's favourite flag via its own
 * user-data query/mutation (NOT threaded through the player store, mirroring
 * TrackRow). Always visible in the bottom bar (not hover-gated).
 */
function FavoriteHeart({ trackId }: { trackId: string }) {
  const t = useTranslations("music");
  const queryClient = useQueryClient();

  const { data } = useQuery<{ isFavorite: boolean; playCount: number }>({
    queryKey: ["music-track-user-data", trackId],
    queryFn: () => fetch(`/api/music/tracks/${trackId}/user-data`).then((r) => r.json()),
  });
  const isFavorite = data?.isFavorite ?? false;

  const mutation = useMutation({
    mutationFn: () =>
      fetch(`/api/music/tracks/${trackId}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !isFavorite }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["music-track-user-data", trackId] });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      aria-label={t("favorite")}
      // p-2.5 + -m-2.5 grows the tap target to 44px without shifting layout.
      className={`focus-ring -m-2.5 flex flex-shrink-0 items-center justify-center rounded-full p-2.5 transition-colors hover:bg-white/10 active:scale-95 ${
        isFavorite ? "text-red-400" : "text-white/70"
      }`}
    >
      <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-400" : ""}`} />
    </button>
  );
}

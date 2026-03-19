"use client";

import { useRef, useState, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ChevronsLeft,
  ChevronsRight,
  Bookmark,
  BookmarkPlus,
  PanelTop,
  RotateCcw,
  Gauge,
  Lock,
} from "lucide-react";
import { BUILTIN_BOOKMARK_ICONS, getBuiltinIcon } from "@/lib/bookmark-icons";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const RESOLUTION_OPTIONS = [
  { maxWidth: 0, labelKey: "resOriginal" as const },
  { maxWidth: 3840, labelKey: "res4K" as const },
  { maxWidth: 2560, labelKey: "res2_5K" as const },
  { maxWidth: 1920, labelKey: "res1080p" as const },
  { maxWidth: 1280, labelKey: "res720p" as const },
  { maxWidth: 854, labelKey: "res480p" as const },
];

export interface BookmarkData {
  id: string;
  timestampSeconds: number;
  discNumber?: number;
  iconType?: string;
  tags?: string[];
  note?: string;
  thumbnailPath?: string | null;
  viewState?: { lon: number; lat: number; fov: number } | null;
}

interface CustomIcon {
  id: string;
  label: string;
  imagePath: string;
  dotColor?: string;
}

export interface PlayerControlsProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackMode: "direct" | "remux" | "transcode" | null;
  encoderName: string | null;
  sourceVideoWidth: number | null;
  selectedMaxWidth: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  isIOS: boolean;
  autoHideControls: boolean;
  showControls: boolean;
  bookmarks: BookmarkData[] | undefined;
  currentDisc: number;
  subtleMarkers: boolean;
  customIcons: CustomIcon[];
  disabledIconIds: Set<string>;
  is360Mode: boolean;
  isLocked: boolean;
  onToggleLock: () => void;
  onResetView?: () => void;
  onSeek: (seconds: number) => void;
  onSkip: (seconds: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (rate: number) => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleAutoHide: () => void;
  onToggle360Mode: () => void;
  onQuickBookmark: () => void;
  onDetailedBookmark: () => void;
  onResolutionChange: (maxWidth: number) => void;
  onRestoreView?: (viewState: { lon: number; lat: number; fov: number }) => void;
  showOsd: (msg: string) => void;
}

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export { formatTime };

export function PlayerControls({
  currentTime,
  duration,
  isPlaying,
  playbackMode,
  encoderName,
  sourceVideoWidth,
  selectedMaxWidth,
  playbackRate,
  volume,
  isMuted,
  isFullscreen,
  isIOS,
  autoHideControls,
  showControls,
  bookmarks,
  currentDisc,
  subtleMarkers,
  customIcons,
  disabledIconIds,
  onSeek,
  onSkip,
  onTogglePlay,
  onSpeedChange,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  is360Mode,
  isLocked,
  onToggleLock,
  onResetView,
  onToggleAutoHide,
  onToggle360Mode,
  onQuickBookmark,
  onDetailedBookmark,
  onResolutionChange,
  onRestoreView,
  showOsd,
}: PlayerControlsProps) {
  const tPlayer = useTranslations("player");
  const volumeAreaRef = useRef<HTMLDivElement>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showResMenu, setShowResMenu] = useState(false);
  const [showEncoderInfo, setShowEncoderInfo] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);
  const dragProgressRef = useRef(0);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const displayProgress = isDragging ? dragProgress : progress;
  const displayTime = isDragging ? (dragProgress / 100) * duration : currentTime;

  const calcProgress = useCallback((clientX: number) => {
    const bar = seekBarRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = calcProgress(e.clientX);
    setIsDragging(true);
    setDragProgress(p);
    dragProgressRef.current = p;
  }, [calcProgress]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const p = calcProgress(e.clientX);
    setDragProgress(p);
    dragProgressRef.current = p;
  }, [isDragging, calcProgress]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    onSeek((dragProgressRef.current / 100) * duration);
  }, [isDragging, duration, onSeek]);

  return (
    <>
      {/* Mobile: left side panel — left-4 clears iOS back-swipe gesture zone */}
      <div
        className={`md:hidden absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onToggleLock}
          className={`flex items-center justify-center h-11 w-11 rounded-full backdrop-blur-sm active:scale-95 transition-all ${
            isLocked ? "bg-primary/30 text-primary" : "bg-black/30 text-white/80 active:bg-white/10"
          }`}
          aria-label={isLocked ? "Unlock controls" : "Lock controls"}
        >
          <Lock className="h-5 w-5" />
        </button>
        {!isLocked && (
          <>
            <button
              onClick={onQuickBookmark}
              className="flex items-center justify-center h-11 w-11 rounded-full bg-black/30 backdrop-blur-sm text-white/80 active:scale-95 active:bg-white/10 transition-all"
              aria-label="Quick bookmark"
            >
              <Bookmark className="h-5 w-5" />
            </button>
            <button
              onClick={onToggle360Mode}
              className={`flex items-center justify-center h-11 w-11 rounded-full backdrop-blur-sm text-[11px] font-semibold active:scale-95 transition-all ${
                is360Mode ? "bg-primary/30 text-primary" : "bg-black/30 text-white/80 active:bg-white/10"
              }`}
              aria-label={is360Mode ? tPlayer("mode360On") : tPlayer("mode360Off")}
            >
              {tPlayer("mode360")}
            </button>
          </>
        )}
      </div>

      {/* Mobile: right side panel — hidden when locked */}
      {!isLocked && <div
        className={`md:hidden absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3 items-center transition-opacity duration-300 ${
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {is360Mode && onResetView && (
          <button
            onClick={onResetView}
            className="flex items-center justify-center h-11 w-11 rounded-full bg-black/30 backdrop-blur-sm text-white/80 active:scale-95 active:bg-white/10 transition-all"
            aria-label="Reset view"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        )}
        {playbackMode === "transcode" && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowResMenu((v) => !v); }}
            className="flex items-center justify-center min-w-[44px] h-11 px-3 rounded-full bg-black/30 backdrop-blur-sm text-[11px] font-semibold text-white/80 active:scale-95 active:bg-white/10 transition-all"
            aria-label="Transcode resolution"
          >
            {tPlayer(RESOLUTION_OPTIONS.find((r) => r.maxWidth === selectedMaxWidth)?.labelKey ?? "resOriginal")}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }}
          className={`flex items-center justify-center h-11 w-11 rounded-full backdrop-blur-sm active:scale-95 transition-all ${
            playbackRate !== 1 ? "bg-primary/30 text-primary" : "bg-black/30 text-white/80 active:bg-white/10"
          }`}
          aria-label="Playback speed"
        >
          <Gauge className="h-5 w-5" />
        </button>
      </div>}

      {/* Mobile: centered speed picker overlay */}
      {showSpeedMenu && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setShowSpeedMenu(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative rounded-2xl bg-zinc-900/95 backdrop-blur-xl py-2 shadow-2xl border border-white/10 min-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2 text-xs text-white/40 font-medium">{tPlayer("speedLabel")}</div>
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                onClick={() => { onSpeedChange(rate); setShowSpeedMenu(false); }}
                className={`flex w-full items-center justify-between px-4 py-3 text-sm ${
                  rate === playbackRate ? "text-primary" : "text-white/80"
                }`}
              >
                <span>{rate}x{rate === 1 ? " (Normal)" : ""}</span>
                {rate === playbackRate && <span className="text-primary">&#10003;</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile: centered resolution picker overlay */}
      {showResMenu && (() => {
        const filtered = RESOLUTION_OPTIONS.filter(
          (opt) => opt.maxWidth === 0 || !sourceVideoWidth || sourceVideoWidth > opt.maxWidth
        );
        return (
          <div
            className="md:hidden fixed inset-0 z-50 flex items-center justify-center"
            onClick={() => setShowResMenu(false)}
          >
            <div className="absolute inset-0 bg-black/50" />
            <div
              className="relative rounded-2xl bg-zinc-900/95 backdrop-blur-xl py-2 shadow-2xl border border-white/10 min-w-[200px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-2 text-xs text-white/40 font-medium">{tPlayer("resolutionLabel")}</div>
              {filtered.map((opt) => (
                <button
                  key={opt.maxWidth}
                  onClick={() => {
                    setShowResMenu(false);
                    if (opt.maxWidth === selectedMaxWidth) return;
                    onResolutionChange(opt.maxWidth);
                    showOsd(tPlayer("switchingTo", { label: tPlayer(opt.labelKey) }));
                  }}
                  className={`flex w-full items-center justify-between px-4 py-3 text-sm ${
                    opt.maxWidth === selectedMaxWidth ? "text-primary" : "text-white/80"
                  }`}
                >
                  <span>{tPlayer(opt.labelKey)}</span>
                  {opt.maxWidth === selectedMaxWidth && <span className="text-primary">&#10003;</span>}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Bottom controls */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-2 md:gap-3 bg-gradient-to-t from-black/80 to-transparent px-3 md:px-8 pb-4 md:pb-6 pt-4 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
      {/* Seek bar — expanded touch target with drag support */}
      <div
        ref={seekBarRef}
        className="group relative cursor-pointer select-none touch-none py-3 -my-3"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Center time display while dragging */}
        {isDragging && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-20 pointer-events-none">
            <div className="rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 px-6 py-3 shadow-2xl">
              <span className="text-3xl md:text-4xl font-medium text-white tabular-nums tracking-tight">
                {formatTime(displayTime)}
              </span>
            </div>
          </div>
        )}
        <div className={`relative rounded-full bg-white/30 transition-[height] duration-150 ${isDragging ? "h-1.5" : "h-1"}`}>
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${displayProgress}%` }}
          />
          {/* Glow ring (visible during drag) */}
          {isDragging && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-7 w-7 rounded-full bg-primary/30"
              style={{ left: `${displayProgress}%` }}
            />
          )}
          {/* Thumb dot */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-primary ${isDragging ? "h-4 w-4 opacity-100 shadow-[0_0_8px_rgba(99,102,241,0.6)]" : "h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150"}`}
            style={{ left: `${displayProgress}%` }}
          />
          {/* Bookmark markers */}
          {bookmarks?.filter((bm) => (bm.discNumber || 1) === currentDisc).map((bm) => {
          const builtin = getBuiltinIcon(bm.iconType || "bookmark");
          const customIcon = !builtin ? customIcons.find((c) => c.id === bm.iconType) : undefined;
          const naturalColor = builtin?.hexColor ?? customIcon?.dotColor ?? "#ffffff";
          const markerColor = subtleMarkers ? "#ffffff" : naturalColor;
          const MarkerIcon = builtin?.icon;
          return (
            <div
              key={bm.id}
              className={`group/marker absolute z-10 flex flex-col items-center cursor-pointer -translate-x-1/2 ${subtleMarkers ? "opacity-40 hover:opacity-80" : "hover:opacity-100"}`}
              style={{
                left: `${duration > 0 ? (bm.timestampSeconds / duration) * 100 : 0}%`,
                bottom: "-2px",
              }}
              title={`${formatTime(bm.timestampSeconds)}${bm.note ? " - " + bm.note : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(bm.timestampSeconds);
                if (bm.viewState && onRestoreView) onRestoreView(bm.viewState);
              }}
            >
              <div className="mb-1 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-transform duration-150 group-hover/marker:scale-150">
                {MarkerIcon ? (
                  <MarkerIcon className="h-5 w-5" style={{ color: markerColor }} />
                ) : customIcon ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={resolveImageSrc(customIcon.imagePath)} alt="" className={`h-5 w-5 object-contain ${subtleMarkers ? "brightness-200 grayscale" : ""}`} />
                ) : (() => {
                  const FallbackIcon = BUILTIN_BOOKMARK_ICONS[0].icon;
                  return <FallbackIcon className="h-5 w-5" style={{ color: markerColor }} />;
                })()}
              </div>
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: markerColor }}
              />
            </div>
          );
        })}
        </div>
      </div>

      {/* Mobile: time + transport row — hidden when locked */}
      {!isLocked && (
        <div className="flex md:hidden items-center">
          <span className="tabular-nums text-xs text-white/80 w-24">
            {formatTime(displayTime)} / {formatTime(duration)}
          </span>
          <div className="flex-1 flex items-center justify-center gap-4">
            <button
              onClick={() => { onSkip(-10); showOsd("\u221210s"); }}
              className="text-white/80 hover:text-white"
            >
              <ChevronsLeft className="h-5 w-5" />
            </button>
            <button onClick={onTogglePlay} className="text-white hover:text-white/90">
              {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
            </button>
            <button
              onClick={() => { onSkip(10); showOsd("+10s"); }}
              className="text-white/80 hover:text-white"
            >
              <ChevronsRight className="h-5 w-5" />
            </button>
          </div>
          <div className="w-24" />
        </div>
      )}

      {/* Desktop bottom row */}
      <div className="relative hidden md:flex items-center justify-between">
        {/* Time display + encoder badge */}
        <div className="flex items-center gap-2">
          <span className="tabular-nums text-xs md:text-sm text-white/80">
            {formatTime(displayTime)} / {formatTime(duration)}
          </span>
          {playbackMode && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEncoderInfo((v) => !v);
                }}
                className="text-xs rounded px-1.5 py-0.5 text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                {playbackMode === "direct" ? tPlayer("modeDirect")
                  : playbackMode === "remux" ? tPlayer("modeRemux")
                  : encoderName && encoderName !== "libx264" ? tPlayer("modeHW") : tPlayer("modeSW")}
              </button>
              {showEncoderInfo && (
                <div
                  className="absolute bottom-full left-0 mb-2 rounded-lg bg-zinc-900/95 px-3 py-2 shadow-xl backdrop-blur whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-xs text-white/50 mb-0.5">
                    {playbackMode === "transcode" ? tPlayer("labelEncoder") : tPlayer("labelPlayback")}
                  </div>
                  <div className="text-sm text-white">
                    {playbackMode === "direct" ? tPlayer("descDirect")
                      : playbackMode === "remux" ? tPlayer("descRemux")
                      : encoderName === "h264_videotoolbox" ? "VideoToolbox (Apple GPU)"
                      : encoderName === "h264_nvenc" ? "NVENC (NVIDIA GPU)"
                      : "Software (CPU)"}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center controls — desktop only (mobile has its own row above) */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-4">
          <button
            onClick={() => { onSkip(-10); showOsd("\u221210s"); }}
            className="text-white/80 hover:text-white"
            title="Rewind 10s"
          >
            <ChevronsLeft className="h-5 w-5" />
          </button>
          <button onClick={onTogglePlay} className="text-white hover:text-white/90">
            {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
          </button>
          <button
            onClick={() => { onSkip(10); showOsd("+10s"); }}
            className="text-white/80 hover:text-white"
            title="Forward 10s"
          >
            <ChevronsRight className="h-5 w-5" />
          </button>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 md:gap-4">
          {/* Group: Bookmarks */}
          <div className="flex items-center gap-1 md:gap-1.5">
            <button
              onClick={onQuickBookmark}
              className="flex items-center justify-center h-6 w-6 md:h-auto md:w-auto text-white/60 hover:text-indigo-400 transition-colors"
              title="Quick bookmark (B)"
            >
              <Bookmark className="h-4 w-4 md:h-5 md:w-5" />
            </button>
            <button
              onClick={onDetailedBookmark}
              className="hidden md:flex items-center justify-center text-white/60 hover:text-yellow-400 transition-colors cursor-pointer"
              title="Detailed bookmark (Shift+B)"
            >
              <BookmarkPlus className="h-5 w-5" />
            </button>
          </div>

          <div className="w-px h-4 bg-white/20 hidden md:block" />

          {/* Group: Mode */}
          <div className="flex items-center gap-1 md:gap-1.5">
            <button
              onClick={onToggle360Mode}
              className={`text-[11px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 rounded leading-5 transition-colors cursor-pointer ${
                is360Mode
                  ? "bg-primary/25 text-primary"
                  : "bg-white/10 text-white/60 hover:bg-white/15 hover:text-white"
              }`}
              title={is360Mode ? tPlayer("mode360On") : tPlayer("mode360Off")}
            >
              {tPlayer("mode360")}
            </button>
            {is360Mode && onResetView && (
              <button
                onClick={onResetView}
                className="flex items-center justify-center h-6 w-6 md:h-auto md:w-auto text-white/60 hover:text-white transition-colors cursor-pointer"
                title="Reset view (R)"
              >
                <RotateCcw className="h-4 w-4 md:h-5 md:w-5" />
              </button>
            )}
          </div>

          <div className="w-px h-4 bg-white/20" />

          {/* Group: Playback settings */}
          <div className="flex items-center gap-1 md:gap-1.5">
            {/* Resolution selector (transcode only) */}
            {playbackMode === "transcode" && (() => {
              const filtered = RESOLUTION_OPTIONS.filter(
                (opt) => opt.maxWidth === 0 || !sourceVideoWidth || sourceVideoWidth > opt.maxWidth
              );
              return (
                <div className="relative flex items-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowResMenu((v) => !v);
                    }}
                    className="text-[11px] md:text-xs font-semibold px-1.5 md:px-2 py-0.5 rounded leading-5 bg-white/10 text-white/60 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
                    title="Transcode resolution"
                  >
                    {tPlayer(RESOLUTION_OPTIONS.find((r) => r.maxWidth === selectedMaxWidth)?.labelKey ?? "resOriginal")}
                  </button>
                  {showResMenu && (
                    <div
                      className="absolute bottom-full right-0 mb-2 rounded-lg bg-zinc-900/95 py-1 shadow-xl backdrop-blur"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {filtered.map((opt) => (
                        <button
                          key={opt.maxWidth}
                          onClick={() => {
                            setShowResMenu(false);
                            if (opt.maxWidth === selectedMaxWidth) return;
                            onResolutionChange(opt.maxWidth);
                            showOsd(tPlayer("switchingTo", { label: tPlayer(opt.labelKey) }));
                          }}
                          className={`block w-full whitespace-nowrap px-4 py-1.5 text-left text-sm ${
                            opt.maxWidth === selectedMaxWidth
                              ? "bg-white/10 text-white"
                              : "text-white/70 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          {tPlayer(opt.labelKey)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Speed control */}
            <div className="relative flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSpeedMenu(!showSpeedMenu);
                }}
                className={`flex items-center justify-center transition-colors cursor-pointer ${
                  playbackRate !== 1
                    ? "text-primary"
                    : "text-white/60 hover:text-white"
                }`}
                title="Playback speed"
              >
                <Gauge className="h-5 w-5" />
              </button>
              {showSpeedMenu && (
                <div
                  className="absolute bottom-full right-0 mb-2 rounded-lg bg-zinc-900/95 py-1 shadow-xl backdrop-blur"
                  onClick={(e) => e.stopPropagation()}
                >
                  {SPEED_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => {
                        onSpeedChange(rate);
                        setShowSpeedMenu(false);
                      }}
                      className={`block w-full whitespace-nowrap px-4 py-1.5 text-left text-sm ${
                        rate === playbackRate
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {rate}x{rate === 1 ? " (Normal)" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="w-px h-4 bg-white/20 hidden md:block" />

          {/* Group: System */}
          <div className="flex items-center gap-1 md:gap-1.5">
            <button
              onClick={onToggleAutoHide}
              className={`hidden md:flex items-center justify-center transition-colors cursor-pointer ${
                autoHideControls ? "text-white/60 hover:text-white" : "text-indigo-400 hover:text-indigo-300"
              }`}
              title={autoHideControls ? "Auto-hide: on" : "Auto-hide: off (controls always visible)"}
            >
              <PanelTop className="h-5 w-5" />
            </button>
            {/* Volume control */}
            <div
              ref={volumeAreaRef}
              className="relative hidden md:flex items-center"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button
                onClick={onToggleMute}
                className="text-white/60 hover:text-white"
                title={isMuted ? "Unmute (M)" : "Mute (M)"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
              {showVolumeSlider && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 rounded-lg bg-zinc-900/95 px-2 py-3 shadow-xl backdrop-blur"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                    className="h-24 w-1 cursor-pointer appearance-none rounded-full bg-white/30 accent-primary"
                    style={{ writingMode: "vertical-lr", direction: "rtl" } as React.CSSProperties}
                  />
                </div>
              )}
            </div>

            {/* Fullscreen (not supported on iOS WebKit) */}
            {!isIOS && (
              <button
                onClick={onToggleFullscreen}
                className="flex items-center justify-center h-6 w-6 md:h-auto md:w-auto text-white/60 hover:text-white"
                title="Fullscreen (F)"
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4 md:h-5 md:w-5" />
                ) : (
                  <Maximize className="h-4 w-4 md:h-5 md:w-5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

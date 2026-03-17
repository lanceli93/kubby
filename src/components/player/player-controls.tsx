"use client";

import { useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Bookmark,
  BookmarkPlus,
  PanelTop,
  RotateCcw,
} from "lucide-react";
import { BUILTIN_BOOKMARK_ICONS, getBuiltinIcon } from "@/lib/bookmark-icons";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const RESOLUTION_OPTIONS = [
  { maxWidth: 0, labelKey: "resOriginal" as const },
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
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showResMenu, setShowResMenu] = useState(false);
  const [showEncoderInfo, setShowEncoderInfo] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`absolute inset-x-0 bottom-0 flex flex-col gap-2 md:gap-3 bg-gradient-to-t from-black/80 to-transparent px-3 md:px-8 pb-4 md:pb-6 pt-4 transition-opacity duration-300 ${
        showControls ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Seek bar */}
      <div
        className="group relative h-1 cursor-pointer rounded-full bg-white/30"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          onSeek(ratio * duration);
        }}
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
          style={{ left: `${progress}%` }}
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

      <div className="relative flex items-center justify-between">
        {/* Time display + encoder badge */}
        <div className="flex items-center gap-2">
          <span className="tabular-nums text-xs md:text-sm text-white/80">
            {formatTime(currentTime)} / {formatTime(duration)}
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

        {/* Center controls */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 md:gap-4">
          <button
            onClick={() => { onSkip(-10); showOsd("\u221210s"); }}
            className="text-white/80 hover:text-white"
            title="Rewind 10s"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button onClick={onTogglePlay} className="text-white hover:text-white/90">
            {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
          </button>
          <button
            onClick={() => { onSkip(10); showOsd("+10s"); }}
            className="text-white/80 hover:text-white"
            title="Forward 10s"
          >
            <SkipForward className="h-5 w-5" />
          </button>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={onQuickBookmark}
            className="hidden md:block text-white/60 hover:text-indigo-400 transition-colors"
            title="Quick bookmark (B)"
          >
            <Bookmark className="h-5 w-5" />
          </button>
          <button
            onClick={onDetailedBookmark}
            className="hidden md:block text-white/60 hover:text-yellow-400 transition-colors cursor-pointer"
            title="Detailed bookmark (Shift+B)"
          >
            <BookmarkPlus className="h-5 w-5" />
          </button>
          <button
            onClick={onToggleAutoHide}
            className={`hidden md:block transition-colors cursor-pointer ${
              autoHideControls ? "text-white/60 hover:text-white" : "text-indigo-400 hover:text-indigo-300"
            }`}
            title={autoHideControls ? "Auto-hide: on" : "Auto-hide: off (controls always visible)"}
          >
            <PanelTop className="h-5 w-5" />
          </button>

          {/* 360° mode toggle + reset view */}
          <button
            onClick={onToggle360Mode}
            className={`transition-colors cursor-pointer text-xs font-bold px-1.5 py-0.5 rounded ${
              is360Mode ? "bg-primary/30 text-primary" : "text-white/60 hover:text-white"
            }`}
            title={is360Mode ? tPlayer("mode360On") : tPlayer("mode360Off")}
          >
            {tPlayer("mode360")}
          </button>
          {is360Mode && onResetView && (
            <button
              onClick={onResetView}
              className="text-white/60 hover:text-white transition-colors cursor-pointer"
              title="Reset view (R)"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          )}

          {/* Resolution selector (transcode only) */}
          {playbackMode === "transcode" && (() => {
            const filtered = RESOLUTION_OPTIONS.filter(
              (opt) => opt.maxWidth === 0 || !sourceVideoWidth || sourceVideoWidth > opt.maxWidth
            );
            return (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowResMenu((v) => !v);
                  }}
                  className="text-xs rounded px-1.5 py-0.5 text-white/60 hover:text-white transition-colors cursor-pointer"
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
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeedMenu(!showSpeedMenu);
              }}
              className={`rounded px-1.5 py-0.5 text-sm transition-colors cursor-pointer ${
                playbackRate !== 1
                  ? "bg-white/20 text-white"
                  : "text-white/60 hover:text-white"
              }`}
              title="Playback speed"
            >
              {playbackRate}x
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

          {/* Fullscreen */}
          {!isIOS && (
            <button
              onClick={onToggleFullscreen}
              className="text-white/60 hover:text-white"
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

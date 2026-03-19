"use client";

import { useState } from "react";
import { ArrowLeft, HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface PlayerTopBarProps {
  title: string;
  currentDiscLabel: string | null;
  isMultiDisc: boolean;
  currentDisc: number;
  totalDiscs: number;
  showControls: boolean;
  isLocked?: boolean;
  playbackMode?: "direct" | "remux" | "transcode" | null;
  encoderName?: string | null;
  onBack: () => void;
  onToggleHelp: () => void;
}

export function PlayerTopBar({
  currentDiscLabel,
  isMultiDisc,
  currentDisc,
  totalDiscs,
  showControls,
  isLocked,
  playbackMode,
  encoderName,
  onBack,
  onToggleHelp,
}: PlayerTopBarProps) {
  const tPlayer = useTranslations("player");
  const [showEncoderInfo, setShowEncoderInfo] = useState(false);

  const modeLabel = !playbackMode ? null
    : playbackMode === "direct" ? tPlayer("modeDirect")
    : playbackMode === "remux" ? tPlayer("modeRemux")
    : encoderName && encoderName !== "libx264" ? tPlayer("modeHW") : tPlayer("modeSW");

  return (
    <div
      className={`absolute inset-x-0 top-0 flex h-14 md:h-20 items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 md:px-8 transition-opacity duration-300 ${
        showControls ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-white/80 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="h-5 w-5 md:h-6 md:w-6" />
        </button>
        {!isLocked && currentDiscLabel && (
          <span className="text-sm md:text-base font-medium text-white/60">
            {currentDiscLabel}
          </span>
        )}
      </div>

      {/* Playback mode badge — mobile, centered (hidden when locked) */}
      {!isLocked && modeLabel && (
        <div className="md:hidden absolute left-1/2 -translate-x-1/2">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowEncoderInfo((v) => !v);
              }}
              className="text-xs rounded px-2 py-0.5 text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              {modeLabel}
            </button>
            {showEncoderInfo && (
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 rounded-lg bg-zinc-900/95 px-3 py-2 shadow-xl backdrop-blur whitespace-nowrap"
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
        </div>
      )}

      {!isLocked && (
        <div className="flex items-center gap-3">
          {isMultiDisc && (
            <span className="text-sm text-white/60">
              {currentDisc} / {totalDiscs}
            </span>
          )}
          <button
            onClick={onToggleHelp}
            className="text-white/40 hover:text-white/80"
            title="Keyboard shortcuts (?)"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

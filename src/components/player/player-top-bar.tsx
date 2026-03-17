"use client";

import { ArrowLeft, HelpCircle } from "lucide-react";

interface PlayerTopBarProps {
  title: string;
  currentDiscLabel: string | null;
  isMultiDisc: boolean;
  currentDisc: number;
  totalDiscs: number;
  showControls: boolean;
  onBack: () => void;
  onToggleHelp: () => void;
}

export function PlayerTopBar({
  title,
  currentDiscLabel,
  isMultiDisc,
  currentDisc,
  totalDiscs,
  showControls,
  onBack,
  onToggleHelp,
}: PlayerTopBarProps) {
  return (
    <div
      className={`absolute inset-x-0 top-0 flex h-20 items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-8 transition-opacity duration-300 ${
        showControls ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-white/80 hover:text-white cursor-pointer"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <span className="text-base font-medium text-white">
          {title}
          {currentDiscLabel && (
            <span className="ml-2 text-white/60">— {currentDiscLabel}</span>
          )}
        </span>
      </div>
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
    </div>
  );
}

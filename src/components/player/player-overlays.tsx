"use client";

import { Play, X } from "lucide-react";
import { BUILTIN_BOOKMARK_ICONS } from "@/lib/bookmark-icons";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";

interface CustomIcon {
  id: string;
  label: string;
  imagePath: string;
  dotColor?: string;
}

interface CenterPlayButtonProps {
  isPlaying: boolean;
  osdMessage: string | null;
}

export function CenterPlayButton({ isPlaying, osdMessage }: CenterPlayButtonProps) {
  if (isPlaying || osdMessage) return null;
  return (
    <div className="pointer-events-none absolute inset-0 hidden md:flex items-center justify-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/20">
        <Play className="h-8 w-8 text-white" />
      </div>
    </div>
  );
}

interface OsdOverlayProps {
  message: string | null;
}

export function OsdOverlay({ message }: OsdOverlayProps) {
  if (!message) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="rounded-lg bg-black/70 px-6 py-3 text-lg font-medium text-white">
        {message}
      </div>
    </div>
  );
}

interface HelpOverlayProps {
  show: boolean;
  onClose: () => void;
}

export function HelpOverlay({ show, onClose }: HelpOverlayProps) {
  if (!show) return null;
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="relative max-h-[80vh] w-[480px] overflow-y-auto rounded-xl bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 text-sm">
          {[
            ["Space / K", "Play / Pause"],
            ["\u2190", "Rewind 5s"],
            ["Shift + \u2190", "Rewind 30s"],
            ["\u2192", "Forward 5s"],
            ["Shift + \u2192", "Forward 30s"],
            ["\u2191", "Volume up"],
            ["\u2193", "Volume down"],
            ["M", "Mute / Unmute"],
            ["F", "Toggle fullscreen"],
            ["> or .", "Increase speed"],
            ["< or ,", "Decrease speed"],
            ["B", "Quick bookmark"],
            ["Shift + B", "Detailed bookmark"],
            ["?", "Show / Hide this help"],
            ["Esc", "Close this help"],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-white/70">{desc}</span>
              <kbd className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-white/90">
                {key}
              </kbd>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-white/40">
          Click the speed button or use the volume hover slider for mouse controls.
        </p>
      </div>
    </div>
  );
}

interface BookmarkPanelProps {
  show: boolean;
  onClose: () => void;
  formatTime: (s: number) => string;
  getRealTime: () => number;
  bookmarkIconType: string;
  setBookmarkIconType: (v: string) => void;
  bookmarkTags: string[];
  setBookmarkTags: (v: string[]) => void;
  bookmarkNote: string;
  setBookmarkNote: (v: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  disabledIconIds: Set<string>;
  customIcons: CustomIcon[];
  onSave: () => void;
}

export function BookmarkPanel({
  show,
  onClose,
  formatTime,
  getRealTime,
  bookmarkIconType,
  setBookmarkIconType,
  bookmarkTags,
  setBookmarkTags,
  bookmarkNote,
  setBookmarkNote,
  tagInput,
  setTagInput,
  disabledIconIds,
  customIcons,
  onSave,
}: BookmarkPanelProps) {
  const tPM = useTranslations("personalMetadata");

  if (!show) return null;
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-[400px] rounded-xl border border-white/10 bg-black/70 p-6 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-lg font-semibold text-white">Add Bookmark</h3>

        {/* Timestamp */}
        <div className="mb-4">
          <label className="mb-1 block text-sm text-white/60">Timestamp</label>
          <div className="rounded-md bg-white/10 px-3 py-2 text-sm text-white">
            {formatTime(getRealTime())}
          </div>
        </div>

        {/* Icon type */}
        <div className="mb-4">
          <label className="mb-1 block text-sm text-white/60">Type</label>
          <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto p-0.5">
            {BUILTIN_BOOKMARK_ICONS.filter((bi) => !disabledIconIds.has(bi.id)).map((bi) => {
              const BiIcon = bi.icon;
              return (
                <button
                  key={bi.id}
                  onClick={() => setBookmarkIconType(bi.id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                    bookmarkIconType === bi.id
                      ? `${bi.bgSelected} ${bi.color} ring-1 ${bi.ringSelected}`
                      : "bg-white/10 text-white/60 hover:text-white"
                  }`}
                >
                  <BiIcon className="h-3.5 w-3.5" />
                  {tPM(`builtinIcon_${bi.id}`)}
                </button>
              );
            })}
            {customIcons.filter((ci) => !disabledIconIds.has(ci.id)).map((ci) => (
              <button
                key={ci.id}
                onClick={() => setBookmarkIconType(ci.id)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  bookmarkIconType === ci.id
                    ? "bg-white/20 text-white ring-1 ring-white/50"
                    : "bg-white/10 text-white/60 hover:text-white"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveImageSrc(ci.imagePath)} alt={ci.label} className="h-3.5 w-3.5 object-contain" />
                {ci.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className="mb-1 block text-sm text-white/60">Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {bookmarkTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs text-white"
              >
                {tag}
                <button
                  onClick={() => setBookmarkTags(bookmarkTags.filter((t) => t !== tag))}
                  className="text-white/50 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tagInput.trim()) {
                e.preventDefault();
                if (!bookmarkTags.includes(tagInput.trim())) {
                  setBookmarkTags([...bookmarkTags, tagInput.trim()]);
                }
                setTagInput("");
              }
            }}
            placeholder="Type and press Enter to add"
            className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>

        {/* Note */}
        <div className="mb-5">
          <label className="mb-1 block text-sm text-white/60">Note</label>
          <textarea
            value={bookmarkNote}
            onChange={(e) => setBookmarkNote(e.target.value)}
            placeholder="Optional note..."
            rows={2}
            className="w-full resize-none rounded-md bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-white/60 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            Save Bookmark
          </button>
        </div>
      </div>
    </div>
  );
}

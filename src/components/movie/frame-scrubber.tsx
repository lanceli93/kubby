"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { BUILTIN_BOOKMARK_ICONS, getBuiltinIcon } from "@/lib/bookmark-icons";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import type { CustomIconData } from "@/components/movie/bookmark-card";

interface BookmarkData {
  id: string;
  timestampSeconds: number;
  discNumber?: number;
  iconType?: string;
  tags?: string[];
  note?: string;
  thumbnailPath?: string | null;
}

interface DiscInfo {
  discNumber: number;
  label?: string;
  runtimeSeconds?: number | null;
}

interface FrameScrubberProps {
  movieId: string;
  runtimeSeconds: number;
  discCount: number;
  discs?: DiscInfo[];
  bookmarks: BookmarkData[];
  customIcons: CustomIconData[];
  disabledIconIds?: string[];
  onClose: () => void;
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function FrameScrubber({
  movieId,
  runtimeSeconds,
  discCount,
  discs,
  bookmarks,
  customIcons,
  disabledIconIds,
  onClose,
}: FrameScrubberProps) {
  const t = useTranslations("movies");
  const tPM = useTranslations("personalMetadata");
  const queryClient = useQueryClient();

  const [currentDisc, setCurrentDisc] = useState(1);
  const [seekSeconds, setSeekSeconds] = useState(0);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [frameLoading, setFrameLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Bookmark creation state
  const [bookmarkIconType, setBookmarkIconType] = useState("bookmark");
  const [bookmarkTags, setBookmarkTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [bookmarkNote, setBookmarkNote] = useState("");
  const [saveToast, setSaveToast] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disabledSet = new Set(disabledIconIds || []);

  // Get runtime for current disc
  const currentRuntime = (() => {
    if (discCount <= 1) return runtimeSeconds;
    const disc = discs?.find((d) => d.discNumber === currentDisc);
    return disc?.runtimeSeconds || runtimeSeconds;
  })();

  // Fetch a frame at the given timestamp
  const fetchFrame = useCallback(
    (seconds: number) => {
      const url = `/api/movies/${movieId}/frame?t=${Math.round(seconds)}&disc=${currentDisc}&maxWidth=960`;
      setFrameUrl(url);
      setFrameLoading(true);
    },
    [movieId, currentDisc]
  );

  // Debounced fetch for dragging
  const debouncedFetch = useCallback(
    (seconds: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchFrame(seconds), 300);
    },
    [fetchFrame]
  );

  // Handle bar click/drag position calculation
  const getSecondsFromEvent = useCallback(
    (clientX: number) => {
      if (!barRef.current) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * currentRuntime;
    },
    [currentRuntime]
  );

  // Mouse down on bar = start drag + immediate fetch
  const handleBarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const seconds = getSecondsFromEvent(e.clientX);
      setSeekSeconds(seconds);
      setIsDragging(true);
      fetchFrame(seconds);
    },
    [getSecondsFromEvent, fetchFrame]
  );

  // Global mouse move/up for drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const seconds = getSecondsFromEvent(e.clientX);
      setSeekSeconds(seconds);
      debouncedFetch(seconds);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, getSecondsFromEvent, debouncedFetch]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Save bookmark mutation
  const saveBookmark = useMutation({
    mutationFn: async () => {
      // Fetch the frame as a blob for thumbnail
      const thumbUrl = `/api/movies/${movieId}/frame?t=${Math.round(seekSeconds)}&disc=${currentDisc}&maxWidth=960`;
      const thumbRes = await fetch(thumbUrl);
      const thumbBlob = await thumbRes.blob();

      const formData = new FormData();
      formData.append("timestampSeconds", String(Math.round(seekSeconds)));
      formData.append("discNumber", String(currentDisc));
      formData.append("iconType", bookmarkIconType);
      if (bookmarkTags.length > 0) {
        formData.append("tags", JSON.stringify(bookmarkTags));
      }
      if (bookmarkNote.trim()) {
        formData.append("note", bookmarkNote.trim());
      }
      formData.append("thumbnail", thumbBlob, "frame.jpg");

      const res = await fetch(`/api/movies/${movieId}/bookmarks`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to save bookmark");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movie-bookmarks", movieId] });
      // Reset form
      setBookmarkIconType("bookmark");
      setBookmarkTags([]);
      setBookmarkNote("");
      setTagInput("");
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2000);
    },
  });

  // Filter bookmarks for current disc
  const discBookmarks = bookmarks.filter((bm) => (bm.discNumber || 1) === currentDisc);

  const progress = currentRuntime > 0 ? (seekSeconds / currentRuntime) * 100 : 0;

  return (
    <div className="relative rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
      {/* Header: disc tabs + close button */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {discCount > 1 && discs && discs.map((disc) => (
            <button
              key={disc.discNumber}
              onClick={() => {
                setCurrentDisc(disc.discNumber);
                setSeekSeconds(0);
                setFrameUrl(null);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                currentDisc === disc.discNumber
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {disc.label || `${t("disc")} ${disc.discNumber}`}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-white/50 transition-colors hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
          {t("closeScrubber")}
        </button>
      </div>

      {/* Frame preview */}
      <div className="relative mb-4 aspect-video w-full overflow-hidden rounded-lg bg-black/50">
        {frameUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frameUrl}
              alt="Frame preview"
              className="h-full w-full object-contain"
              onLoad={() => setFrameLoading(false)}
              onError={() => setFrameLoading(false)}
            />
            {frameLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="h-8 w-8 animate-spin text-white/70" />
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/30">
            {t("scrubberDragHint")}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-2 px-1">
        <div
          ref={barRef}
          className="group relative h-2 cursor-pointer rounded-full bg-white/20"
          onMouseDown={handleBarMouseDown}
        >
          {/* Filled portion */}
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-75"
            style={{ width: `${progress}%` }}
          />
          {/* Cursor handle */}
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-lg"
            style={{ left: `${progress}%` }}
          />
          {/* Bookmark markers */}
          {discBookmarks.map((bm) => {
            const builtin = getBuiltinIcon(bm.iconType || "bookmark");
            const customIcon = !builtin ? customIcons.find((c) => c.id === bm.iconType) : undefined;
            const markerColor = builtin?.hexColor ?? customIcon?.dotColor ?? "#ffffff";
            return (
              <div
                key={bm.id}
                className="absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/50 cursor-pointer hover:scale-150 transition-transform"
                style={{
                  left: `${currentRuntime > 0 ? (bm.timestampSeconds / currentRuntime) * 100 : 0}%`,
                  backgroundColor: markerColor,
                }}
                title={`${formatTime(bm.timestampSeconds)}${bm.note ? " - " + bm.note : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const s = bm.timestampSeconds;
                  setSeekSeconds(s);
                  fetchFrame(s);
                }}
              />
            );
          })}
        </div>
        {/* Time display */}
        <div className="mt-1.5 flex items-center justify-between text-xs text-white/50">
          <span className="tabular-nums">{formatTime(seekSeconds)}</span>
          <span className="tabular-nums">{formatTime(currentRuntime)}</span>
        </div>
      </div>

      {/* Bookmark creation section */}
      <div className="mt-4 border-t border-white/10 pt-4">
        {/* Icon selector */}
        <div className="mb-3">
          <label className="mb-1.5 block text-sm text-white/60">{t("bookmarkType")}</label>
          <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto">
            {BUILTIN_BOOKMARK_ICONS.filter((bi) => !disabledSet.has(bi.id)).map((bi) => {
              const BiIcon = bi.icon;
              return (
                <button
                  key={bi.id}
                  onClick={() => setBookmarkIconType(bi.id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
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
            {customIcons.filter((ci) => !disabledSet.has(ci.id)).map((ci) => (
              <button
                key={ci.id}
                onClick={() => setBookmarkIconType(ci.id)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
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
        <div className="mb-3">
          <label className="mb-1.5 block text-sm text-white/60">{t("bookmarkTags")}</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {bookmarkTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs text-white"
              >
                {tag}
                <button
                  onClick={() => setBookmarkTags(bookmarkTags.filter((t) => t !== tag))}
                  className="text-white/50 hover:text-white cursor-pointer"
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
            placeholder={t("tagsPlaceholder")}
            className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>

        {/* Note */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm text-white/60">{t("bookmarkNote")}</label>
          <textarea
            value={bookmarkNote}
            onChange={(e) => setBookmarkNote(e.target.value)}
            placeholder={t("bookmarkNotePlaceholder")}
            rows={2}
            className="w-full resize-none rounded-md bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-white/30"
          />
        </div>

        {/* Save button */}
        <div className="flex items-center justify-end gap-3">
          {saveToast && (
            <span className="text-sm text-green-400">{t("bookmarkSaved")}</span>
          )}
          <button
            onClick={() => saveBookmark.mutate()}
            disabled={saveBookmark.isPending || !frameUrl}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saveBookmark.isPending ? t("scrubberLoading") : t("addBookmark")}
          </button>
        </div>
      </div>
    </div>
  );
}

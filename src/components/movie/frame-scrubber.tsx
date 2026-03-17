"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Camera, ChevronDown } from "lucide-react";
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

interface CastMember {
  id: string;
  name: string;
  photoPath?: string | null;
}

interface FrameScrubberProps {
  movieId: string;
  runtimeSeconds: number;
  discCount: number;
  discs?: DiscInfo[];
  bookmarks: BookmarkData[];
  customIcons: CustomIconData[];
  disabledIconIds?: string[];
  cast?: CastMember[];
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

// Parse time string: "1:23:45", "23:45", "1425" (seconds)
function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pure number = seconds
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // H:MM:SS or MM:SS
  const parts = trimmed.split(":").map((p) => parseFloat(p));
  if (parts.some(isNaN)) return null;

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export function FrameScrubber({
  movieId,
  runtimeSeconds,
  discCount,
  discs,
  bookmarks,
  customIcons,
  disabledIconIds,
  cast,
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
  const [timeInput, setTimeInput] = useState("");
  const [selectedActorId, setSelectedActorId] = useState("");
  const [actorDropdownOpen, setActorDropdownOpen] = useState(false);
  const [flashBookmark, setFlashBookmark] = useState(false);
  const [flashScreenshot, setFlashScreenshot] = useState(false);
  const [actorImgErrors, setActorImgErrors] = useState<Set<string>>(new Set());

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
      setFrameUrl((prev) => {
        if (prev === url) return prev; // same URL — skip, onLoad won't re-fire
        setFrameLoading(true);
        return url;
      });
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

  // Close actor dropdown on outside click
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!actorDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActorDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [actorDropdownOpen]);

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

  // Save screenshot to actor gallery
  const saveScreenshot = useMutation({
    mutationFn: async () => {
      if (!selectedActorId) throw new Error("No actor selected");
      const thumbUrl = `/api/movies/${movieId}/frame?t=${Math.round(seekSeconds)}&disc=${currentDisc}&maxWidth=1920`;
      const res = await fetch(thumbUrl);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append("file", blob, "screenshot.jpg");
      const uploadRes = await fetch(`/api/people/${selectedActorId}/gallery`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload screenshot");
      return uploadRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person-gallery", selectedActorId] });
    },
  });

  // Filter bookmarks for current disc
  const discBookmarks = bookmarks.filter((bm) => (bm.discNumber || 1) === currentDisc);

  const progress = currentRuntime > 0 ? (seekSeconds / currentRuntime) * 100 : 0;

  return (
    <div className="relative z-10 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      {/* Two-column layout: frame with overlay controls on left, form on right */}
      <div className="flex gap-6">
        {/* Left column: frame with overlaid progress bar + controls */}
        <div className="flex-1 min-w-0">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            {/* Frame image */}
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

            {/* Bottom overlay: gradient + button + progress bar + time */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-8">
              {/* Centered frosted buttons above progress bar */}
              <div className="mb-7 flex items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setFlashBookmark(true);
                    saveBookmark.mutate();
                  }}
                  onAnimationEnd={() => setFlashBookmark(false)}
                  disabled={saveBookmark.isPending || !frameUrl}
                  className={`rounded-full border border-white/20 bg-white/10 px-16 py-2 text-sm font-medium text-white/90 backdrop-blur-md transition-all hover:bg-white/20 hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer ${flashBookmark ? "glass-flash" : ""}`}
                >
                  {`+ ${t("addBookmark")}`}
                </button>
                <button
                  onClick={() => {
                    setFlashScreenshot(true);
                    saveScreenshot.mutate();
                  }}
                  onAnimationEnd={() => setFlashScreenshot(false)}
                  disabled={saveScreenshot.isPending || !frameUrl || !selectedActorId}
                  className={`flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-medium text-white/90 backdrop-blur-md transition-all hover:bg-white/20 hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer ${flashScreenshot ? "glass-flash" : ""}`}
                  title={t("screenshotToGallery")}
                >
                  <Camera className="h-4 w-4" />
                  {t("screenshot")}
                </button>
              </div>

              {/* Progress bar */}
              <div
                ref={barRef}
                className="group relative h-1 cursor-pointer rounded-full bg-white/30 before:absolute before:-inset-y-2 before:inset-x-0 before:content-['']"
                onMouseDown={handleBarMouseDown}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-75"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ left: `${progress}%` }}
                />
                {/* Bookmark markers */}
                {discBookmarks.map((bm) => {
                  const builtin = getBuiltinIcon(bm.iconType || "bookmark");
                  const customIcon = !builtin ? customIcons.find((c) => c.id === bm.iconType) : undefined;
                  const markerColor = builtin?.hexColor ?? customIcon?.dotColor ?? "#ffffff";
                  const MarkerIcon = builtin?.icon;
                  return (
                    <div
                      key={bm.id}
                      className="group/marker absolute z-10 flex flex-col items-center cursor-pointer -translate-x-1/2"
                      style={{
                        left: `${currentRuntime > 0 ? (bm.timestampSeconds / currentRuntime) * 100 : 0}%`,
                        bottom: "-2px",
                      }}
                      title={`${formatTime(bm.timestampSeconds)}${bm.note ? " - " + bm.note : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSeekSeconds(bm.timestampSeconds);
                        fetchFrame(bm.timestampSeconds);
                      }}
                    >
                      <div className="mb-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-transform duration-150 group-hover/marker:scale-150">
                        {MarkerIcon ? (
                          <MarkerIcon className="h-4 w-4" style={{ color: markerColor }} />
                        ) : customIcon ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={resolveImageSrc(customIcon.imagePath)} alt="" className="h-4 w-4 object-contain" />
                        ) : (() => {
                          const FallbackIcon = BUILTIN_BOOKMARK_ICONS[0].icon;
                          return <FallbackIcon className="h-4 w-4" style={{ color: markerColor }} />;
                        })()}
                      </div>
                      <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: markerColor }} />
                    </div>
                  );
                })}
              </div>

              {/* Time display */}
              <div className="mt-1.5">
                <span className="tabular-nums text-xs text-white/70">{formatTime(seekSeconds)} / {formatTime(currentRuntime)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: bookmark form */}
        <div className="w-[380px] flex-shrink-0 flex flex-col">
          {/* Disc tabs + close */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {discCount > 1 && discs && discs.map((disc) => (
                <button
                  key={disc.discNumber}
                  onClick={() => {
                    setCurrentDisc(disc.discNumber);
                    setSeekSeconds(0);
                    setFrameUrl(null);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    currentDisc === disc.discNumber
                      ? "bg-white/15 text-white"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {disc.label || `${t("disc")} ${disc.discNumber}`}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-white/40 transition-colors hover:text-white cursor-pointer"
              title={t("closeScrubber")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Icon selector */}
          <div className="mb-4">
            <label className="mb-1.5 block text-sm text-white/60">{t("bookmarkType")}</label>
            <div className="flex flex-wrap gap-1.5 p-0.5">
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
          <div className="mb-4">
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
          <div className="mb-3">
            <label className="mb-1.5 block text-sm text-white/60">{t("bookmarkNote")}</label>
            <textarea
              value={bookmarkNote}
              onChange={(e) => setBookmarkNote(e.target.value)}
              placeholder={t("bookmarkNotePlaceholder")}
              rows={2}
              className="w-full resize-none rounded-md bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>

          {/* Jump to timestamp */}
          <div>
            <label className="mb-1.5 block text-sm text-white/60">{t("jumpToTime")}</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const secs = parseTimeInput(timeInput);
                    if (secs != null) {
                      const clamped = Math.max(0, Math.min(secs, currentRuntime));
                      setSeekSeconds(clamped);
                      fetchFrame(clamped);
                      setTimeInput("");
                    }
                  }
                }}
                placeholder="1:23:45"
                className="flex-1 rounded-md bg-white/10 px-3 py-1.5 text-sm tabular-nums text-white placeholder-white/20 outline-none focus:ring-1 focus:ring-white/30"
              />
              <button
                onClick={() => {
                  const secs = parseTimeInput(timeInput);
                  if (secs != null) {
                    const clamped = Math.max(0, Math.min(secs, currentRuntime));
                    setSeekSeconds(clamped);
                    fetchFrame(clamped);
                    setTimeInput("");
                  }
                }}
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/20 hover:text-white cursor-pointer"
              >
                Go
              </button>
            </div>
          </div>

          {/* Actor selector for screenshot */}
          {cast && cast.length > 0 && (
            <div className="mt-3">
              <label className="mb-1.5 block text-sm text-white/60">{t("screenshotToGallery")}</label>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setActorDropdownOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-md bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/15 cursor-pointer"
                >
                  <span className={selectedActorId ? "text-white" : "text-white/30"}>
                    {selectedActorId ? cast.find((c) => c.id === selectedActorId)?.name : t("selectActor")}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${actorDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {actorDropdownOpen && (
                  <div className="absolute z-20 mt-1 max-h-[200px] w-full overflow-y-auto rounded-md border border-white/10 bg-neutral-900/95 py-1 backdrop-blur-lg">
                    {cast.map((person) => (
                      <button
                        key={person.id}
                        onClick={() => {
                          setSelectedActorId(person.id);
                          setActorDropdownOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/10 cursor-pointer ${
                          selectedActorId === person.id ? "text-primary" : "text-white/80"
                        }`}
                      >
                        {person.photoPath && !actorImgErrors.has(person.id) ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={resolveImageSrc(person.photoPath)}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover"
                            onError={() => setActorImgErrors(prev => new Set(prev).add(person.id))}
                          />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] text-white/50">
                            {person.name[0]?.toUpperCase()}
                          </div>
                        )}
                        {person.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

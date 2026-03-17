"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useEffect, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useUserPreferences, type UserPreferences } from "@/hooks/use-user-preferences";
import { usePlaybackSession } from "@/hooks/use-playback-session";
import { useProgressSave } from "@/hooks/use-progress-save";
import { PlayerTopBar } from "@/components/player/player-top-bar";
import { PlayerControls, formatTime, type BookmarkData } from "@/components/player/player-controls";
import { CenterPlayButton, OsdOverlay, HelpOverlay, BookmarkPanel } from "@/components/player/player-overlays";

const Panorama360Player = dynamic(
  () => import("@/components/player/panorama-360-player").then((m) => m.Panorama360Player),
  { ssr: false },
);

interface DiscData {
  discNumber: number;
  label?: string;
}

interface MovieData {
  id: string;
  title: string;
  discCount?: number;
  discs?: DiscData[];
  userData?: {
    playbackPositionSeconds?: number;
    currentDisc?: number;
  };
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const movieId = params.id as string;
  const queryClient = useQueryClient();

  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const osdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [currentDisc, setCurrentDisc] = useState<number>(1);
  const initializedRef = useRef(false);
  const [showControls, setShowControls] = useState(true);
  const [autoHideControls, setAutoHideControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [osdMessage, setOsdMessage] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showBookmarkPanel, setShowBookmarkPanel] = useState(false);
  const [selectedMaxWidth, setSelectedMaxWidth] = useState(0);

  // Bookmark panel state
  const [bookmarkIconType, setBookmarkIconType] = useState("bookmark");
  const [bookmarkTags, setBookmarkTags] = useState<string[]>([]);
  const [bookmarkNote, setBookmarkNote] = useState("");
  const [tagInput, setTagInput] = useState("");

  // Data fetching
  const { data: movie } = useQuery<MovieData>({
    queryKey: ["movie-player", movieId],
    queryFn: () => fetch(`/api/movies/${movieId}`).then((r) => r.json()),
  });

  const { data: bookmarks } = useQuery<BookmarkData[]>({
    queryKey: ["movie-bookmarks", movieId],
    queryFn: () => fetch(`/api/movies/${movieId}/bookmarks`).then((r) => r.json()),
  });

  const { data: customIcons = [] } = useQuery<{ id: string; label: string; imagePath: string; dotColor?: string }[]>({
    queryKey: ["bookmark-icons"],
    queryFn: () => fetch("/api/settings/bookmark-icons").then((r) => r.json()),
  });

  const { data: userPrefs } = useUserPreferences();
  const disabledIconIds = new Set(userPrefs?.disabledBookmarkIcons ?? []);
  const subtleMarkers = userPrefs?.subtleBookmarkMarkers ?? false;
  const [is360Mode, setIs360Mode] = useState(false);
  const resetViewRef = useRef<(() => void) | null>(null);
  const capture360Ref = useRef<(() => Promise<Blob | null>) | null>(null);
  const view360Ref = useRef<{ getView: () => { lon: number; lat: number; fov: number }; setView: (v: { lon: number; lat: number; fov: number }) => void } | null>(null);
  const initialViewState = useRef<{ lon: number; lat: number; fov: number } | null | undefined>(undefined);
  if (initialViewState.current === undefined) {
    const vsParam = searchParams.get("vs");
    if (vsParam) {
      const parts = vsParam.split(",").map(Number);
      initialViewState.current = parts.length === 3 && parts.every((n) => !isNaN(n))
        ? { lon: parts[0], lat: parts[1], fov: parts[2] }
        : null;
    } else {
      initialViewState.current = null;
    }
  }

  // Sync 360 mode from user preferences on load, or force on if URL has viewState
  useEffect(() => {
    if (userPrefs) setIs360Mode(initialViewState.current ? true : userPrefs.player360Mode);
  }, [userPrefs]);

  const isMultiDisc = (movie?.discCount ?? 1) > 1;
  const totalDiscs = movie?.discCount ?? 1;
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Compute startAt from URL or saved progress
  let startAt = 0;
  if (movie) {
    const tParam = searchParams.get("t");
    if (tParam) {
      startAt = parseInt(tParam, 10) || 0;
    } else if (movie.userData?.playbackPositionSeconds && !searchParams.get("disc")) {
      const savedDisc = movie.userData?.currentDisc ?? 1;
      if (savedDisc === currentDisc) {
        startAt = movie.userData.playbackPositionSeconds;
      }
    }
  }

  const showOsd = useCallback((msg: string) => {
    setOsdMessage(msg);
    clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsdMessage(null), 800);
  }, []);

  // Playback session hook
  const session = usePlaybackSession({
    movieId,
    currentDisc,
    isMultiDisc,
    selectedMaxWidth,
    startAt,
    ready: !!movie,
    showOsd,
  });

  // Progress save hook
  const saveProgress = useProgressSave({
    movieId,
    currentDisc,
    isPlaying: session.isPlaying,
    getRealTime: session.getRealTime,
  });

  // Initialize currentDisc from URL param or userData resume
  useEffect(() => {
    if (!movie || initializedRef.current) return;
    initializedRef.current = true;
    const discParam = searchParams.get("disc");
    if (discParam) {
      setCurrentDisc(parseInt(discParam, 10));
    } else if (movie.userData?.currentDisc && movie.userData.currentDisc > 1) {
      setCurrentDisc(movie.userData.currentDisc);
    }
  }, [movie, searchParams]);

  // Controls visibility
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    if (!autoHideControls) return;
    controlsTimer.current = setTimeout(() => {
      if (session.isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  }, [session.isPlaying, autoHideControls]);

  useEffect(() => {
    if (!autoHideControls) {
      clearTimeout(controlsTimer.current);
      setShowControls(true);
    } else if (session.isPlaying) {
      resetControlsTimer();
    } else {
      clearTimeout(controlsTimer.current);
      setShowControls(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isPlaying, autoHideControls]);

  // Speed helpers
  function changeSpeed(rate: number) {
    if (!session.videoRef.current) return;
    session.videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
    showOsd(`${rate}x`);
  }

  function cycleSpeed(direction: 1 | -1) {
    const idx = SPEED_OPTIONS.indexOf(playbackRate);
    const next = idx + direction;
    if (next >= 0 && next < SPEED_OPTIONS.length) {
      changeSpeed(SPEED_OPTIONS[next]);
    }
  }

  // Volume helpers
  function changeVolume(v: number) {
    if (!session.videoRef.current) return;
    const clamped = Math.max(0, Math.min(1, v));
    session.videoRef.current.volume = clamped;
    setVolume(clamped);
    if (clamped > 0 && isMuted) {
      session.videoRef.current.muted = false;
      setIsMuted(false);
    }
    showOsd(`Volume ${Math.round(clamped * 100)}%`);
  }

  function toggleMute() {
    if (!session.videoRef.current) return;
    const muted = !session.videoRef.current.muted;
    session.videoRef.current.muted = muted;
    setIsMuted(muted);
    showOsd(muted ? "Muted" : `Volume ${Math.round(volume * 100)}%`);
  }

  // Fullscreen
  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Capture video frame for bookmark thumbnails
  async function captureVideoFrame(): Promise<Blob | null> {
    if (is360Mode && capture360Ref.current) {
      return capture360Ref.current();
    }
    const video = session.videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  }

  // Bookmark mutations
  const qbTemplate = userPrefs?.quickBookmarkTemplate;

  const addQuickBookmark = useMutation({
    mutationFn: async () => {
      const thumbnail = await captureVideoFrame();
      const formData = new FormData();
      formData.append("timestampSeconds", String(Math.floor(session.getRealTime())));
      formData.append("discNumber", String(currentDisc));
      formData.append("iconType", qbTemplate?.iconType || "bookmark");
      if (qbTemplate?.tags && qbTemplate.tags.length > 0) formData.append("tags", JSON.stringify(qbTemplate.tags));
      if (qbTemplate?.note) formData.append("note", qbTemplate.note);
      if (thumbnail) formData.append("thumbnail", thumbnail, "thumb.jpg");
      if (is360Mode && view360Ref.current) {
        formData.append("viewState", JSON.stringify(view360Ref.current.getView()));
      }
      return fetch(`/api/movies/${movieId}/bookmarks`, { method: "POST", body: formData }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movie-bookmarks", movieId] });
      showOsd("Bookmark added");
    },
  });

  const saveDetailedBookmark = useMutation({
    mutationFn: async () => {
      const thumbnail = await captureVideoFrame();
      const formData = new FormData();
      formData.append("timestampSeconds", String(Math.floor(session.getRealTime())));
      formData.append("discNumber", String(currentDisc));
      formData.append("iconType", bookmarkIconType);
      if (bookmarkTags.length > 0) formData.append("tags", JSON.stringify(bookmarkTags));
      if (bookmarkNote) formData.append("note", bookmarkNote);
      if (thumbnail) formData.append("thumbnail", thumbnail, "thumb.jpg");
      if (is360Mode && view360Ref.current) formData.append("viewState", JSON.stringify(view360Ref.current.getView()));
      return fetch(`/api/movies/${movieId}/bookmarks`, { method: "POST", body: formData }).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movie-bookmarks", movieId] });
      setShowBookmarkPanel(false);
      setBookmarkIconType("bookmark");
      setBookmarkTags([]);
      setBookmarkNote("");
      setTagInput("");
      showOsd("Bookmark saved");
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          session.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          session.skip(e.shiftKey ? -30 : -5);
          showOsd(e.shiftKey ? "\u221230s" : "\u22125s");
          resetControlsTimer();
          break;
        case "ArrowRight":
          e.preventDefault();
          session.skip(e.shiftKey ? 30 : 5);
          showOsd(e.shiftKey ? "+30s" : "+5s");
          resetControlsTimer();
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume(volume + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(volume - 0.1);
          break;
        case "f":
          e.preventDefault();
          if (!isIOS) toggleFullscreen();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case ">":
        case ".":
          e.preventDefault();
          cycleSpeed(1);
          break;
        case "<":
        case ",":
          e.preventDefault();
          cycleSpeed(-1);
          break;
        case "b":
        case "B":
          e.preventDefault();
          if (e.shiftKey) {
            if (session.videoRef.current && !session.videoRef.current.paused) session.videoRef.current.pause();
            setShowBookmarkPanel(true);
          } else {
            addQuickBookmark.mutate();
          }
          break;
        case "r":
          if (is360Mode) {
            e.preventDefault();
            resetViewRef.current?.();
            showOsd("View reset");
          }
          break;
        case "?":
          e.preventDefault();
          setShowHelp((v) => !v);
          break;
        case "Escape":
          if (showBookmarkPanel) {
            e.preventDefault();
            setShowBookmarkPanel(false);
          } else if (showHelp) {
            e.preventDefault();
            setShowHelp(false);
          }
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, isMuted, playbackRate, session.isPlaying, showHelp, showBookmarkPanel, is360Mode]);

  // Close popover menus when clicking outside (handled by controls component internally now,
  // but we keep the global listener for encoder info popover backward compat)
  const currentDiscLabel = isMultiDisc
    ? movie?.discs?.find((d) => d.discNumber === currentDisc)?.label || `Disc ${currentDisc}`
    : null;

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full bg-black overflow-hidden ${!showControls ? "cursor-none" : ""}`}
      onMouseMove={resetControlsTimer}
      onTouchStart={resetControlsTimer}
      onClick={session.togglePlay}
    >
      <video
        ref={session.videoRef}
        className={is360Mode ? "absolute h-0 w-0 opacity-0" : "h-full w-full"}
        playsInline
        disableRemotePlayback
        onPlay={() => session.setIsPlaying(true)}
        onPause={() => session.setIsPlaying(false)}
        onTimeUpdate={() => { if (!session.hlsSeekingRef.current) session.setCurrentTime(session.getRealTime()); }}
        onLoadedMetadata={() => {
          if (session.hlsDurationRef.current) {
            session.setDuration(session.hlsDurationRef.current);
          } else {
            session.setDuration(session.videoRef.current?.duration || 0);
          }
          if (session.isPlaying || currentDisc > 1) {
            session.videoRef.current?.play().catch(() => {});
          }
        }}
        onCanPlay={() => {
          if (session.pendingSeekRef.current !== null) {
            if (session.videoRef.current) session.videoRef.current.currentTime = session.pendingSeekRef.current;
            session.pendingSeekRef.current = null;
          }
        }}
        onEnded={() => {
          if (isMultiDisc && currentDisc < totalDiscs) {
            const nextDisc = currentDisc + 1;
            saveProgress.mutate({ seconds: 0, disc: nextDisc });
            setCurrentDisc(nextDisc);
            session.setCurrentTime(0);
          } else {
            saveProgress.mutate({ seconds: 0, disc: 1 });
            fetch(`/api/movies/${movieId}/user-data`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isPlayed: true, currentDisc: 1 }),
            });
          }
        }}
      />

      {/* Freeze-frame overlay: a canvas drawn with the last video frame,
          shown during HLS session swaps to cover the black flash.
          Hidden by default; the hook shows/hides it via direct DOM. */}
      <canvas
        ref={session.freezeCanvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        style={{ display: "none" }}
      />

      {is360Mode && (
        <Panorama360Player
          videoRef={session.videoRef}
          isPlaying={session.isPlaying}
          onResetRef={(fn) => { resetViewRef.current = fn; }}
          onCaptureRef={(fn) => { capture360Ref.current = fn; }}
          onViewRef={(fns) => {
            view360Ref.current = fns;
            if (initialViewState.current) {
              fns.setView(initialViewState.current);
              initialViewState.current = null;
            }
          }}
        />
      )}

      <PlayerTopBar
        title={movie?.title || ""}
        currentDiscLabel={currentDiscLabel}
        isMultiDisc={isMultiDisc}
        currentDisc={currentDisc}
        totalDiscs={totalDiscs}
        showControls={showControls}
        onBack={() => {
          saveProgress.mutate({ seconds: session.getRealTime(), disc: currentDisc });
          router.back();
        }}
        onToggleHelp={() => setShowHelp((v) => !v)}
      />

      <CenterPlayButton isPlaying={session.isPlaying} osdMessage={osdMessage} />
      <OsdOverlay message={osdMessage} />
      <HelpOverlay show={showHelp} onClose={() => setShowHelp(false)} />

      <BookmarkPanel
        show={showBookmarkPanel}
        onClose={() => {
          setShowBookmarkPanel(false);
          setBookmarkIconType("bookmark");
          setBookmarkTags([]);
          setBookmarkNote("");
          setTagInput("");
        }}
        formatTime={formatTime}
        getRealTime={session.getRealTime}
        bookmarkIconType={bookmarkIconType}
        setBookmarkIconType={setBookmarkIconType}
        bookmarkTags={bookmarkTags}
        setBookmarkTags={setBookmarkTags}
        bookmarkNote={bookmarkNote}
        setBookmarkNote={setBookmarkNote}
        tagInput={tagInput}
        setTagInput={setTagInput}
        disabledIconIds={disabledIconIds}
        customIcons={customIcons}
        onSave={() => saveDetailedBookmark.mutate()}
      />

      <PlayerControls
        currentTime={session.currentTime}
        duration={session.duration}
        isPlaying={session.isPlaying}
        playbackMode={session.playbackMode}
        encoderName={session.encoderName}
        sourceVideoWidth={session.sourceVideoWidth}
        selectedMaxWidth={selectedMaxWidth}
        playbackRate={playbackRate}
        volume={volume}
        isMuted={isMuted}
        isFullscreen={isFullscreen}
        isIOS={isIOS}
        autoHideControls={autoHideControls}
        showControls={showControls}
        bookmarks={bookmarks}
        currentDisc={currentDisc}
        subtleMarkers={subtleMarkers}
        customIcons={customIcons}
        disabledIconIds={disabledIconIds}
        onSeek={session.seekTo}
        onSkip={session.skip}
        onTogglePlay={session.togglePlay}
        onSpeedChange={changeSpeed}
        onVolumeChange={changeVolume}
        onToggleMute={toggleMute}
        onToggleFullscreen={toggleFullscreen}
        is360Mode={is360Mode}
        onResetView={() => resetViewRef.current?.()}
        onToggleAutoHide={() => setAutoHideControls((v) => !v)}
        onToggle360Mode={() => {
          const next = !is360Mode;
          setIs360Mode(next);
          showOsd(next ? "360° ON" : "360° OFF");
          queryClient.setQueryData<UserPreferences>(["userPreferences"], (old) =>
            old ? { ...old, player360Mode: next } : old
          );
          fetch("/api/settings/personal-metadata", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ player360Mode: next }),
          }).catch(() => {});
        }}
        onQuickBookmark={() => addQuickBookmark.mutate()}
        onDetailedBookmark={() => {
          if (session.videoRef.current && !session.videoRef.current.paused) session.videoRef.current.pause();
          setShowBookmarkPanel(true);
        }}
        onResolutionChange={async (maxWidth) => {
          setSelectedMaxWidth(maxWidth);
          await session.changeResolution(maxWidth);
        }}
        onRestoreView={(vs) => view360Ref.current?.setView(vs)}
        showOsd={showOsd}
      />
    </div>
  );
}

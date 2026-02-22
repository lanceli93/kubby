"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRef, useEffect, useCallback, useState } from "react";
import {
  Play,
  Pause,
  ArrowLeft,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Gauge,
  HelpCircle,
  X,
} from "lucide-react";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

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

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const movieId = params.id as string;
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [currentDisc, setCurrentDisc] = useState<number>(1);
  const initializedRef = useRef(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [osdMessage, setOsdMessage] = useState<string | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const volumeAreaRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const { data: movie } = useQuery<MovieData>({
    queryKey: ["movie-player", movieId],
    queryFn: () => fetch(`/api/movies/${movieId}`).then((r) => r.json()),
  });

  const isMultiDisc = (movie?.discCount ?? 1) > 1;
  const totalDiscs = movie?.discCount ?? 1;

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

  const saveProgress = useMutation({
    mutationFn: (data: { seconds: number; disc?: number }) =>
      fetch(`/api/movies/${movieId}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbackPositionSeconds: Math.floor(data.seconds),
          ...(data.disc !== undefined ? { currentDisc: data.disc } : {}),
        }),
      }),
  });

  // Auto-save progress every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && isPlaying) {
        saveProgress.mutate({ seconds: videoRef.current.currentTime, disc: currentDisc });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, movieId, currentDisc, saveProgress]);

  // Restore position on load (only for the initial disc)
  useEffect(() => {
    if (!movie || !initializedRef.current) return;
    const pos = movie.userData?.playbackPositionSeconds;
    const savedDisc = movie.userData?.currentDisc ?? 1;
    // Only restore position if we're on the saved disc (resume scenario)
    if (pos && videoRef.current && savedDisc === currentDisc && !searchParams.get("disc")) {
      videoRef.current.currentTime = pos;
    }
  }, [movie?.userData?.playbackPositionSeconds, movie?.userData?.currentDisc, currentDisc, searchParams, movie]);

  // Hide controls after inactivity
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowSpeedMenu(false);
        setShowVolumeSlider(false);
      }
    }, 3000);
  }, [isPlaying]);

  // Auto-hide controls when playback starts
  useEffect(() => {
    if (isPlaying) {
      resetControlsTimer();
    } else {
      clearTimeout(controlsTimer.current);
      setShowControls(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const showOsd = useCallback((msg: string) => {
    setOsdMessage(msg);
    clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsdMessage(null), 800);
  }, []);

  function changeSpeed(rate: number) {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = rate;
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

  function changeVolume(v: number) {
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(1, v));
    videoRef.current.volume = clamped;
    setVolume(clamped);
    if (clamped > 0 && isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
    showOsd(`Volume ${Math.round(clamped * 100)}%`);
  }

  function toggleMute() {
    if (!videoRef.current) return;
    const muted = !videoRef.current.muted;
    videoRef.current.muted = muted;
    setIsMuted(muted);
    showOsd(muted ? "Muted" : `Volume ${Math.round(volume * 100)}%`);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(e.shiftKey ? -30 : -5);
          showOsd(e.shiftKey ? "−30s" : "−5s");
          resetControlsTimer();
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(e.shiftKey ? 30 : 5);
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
          toggleFullscreen();
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
        case "?":
          e.preventDefault();
          setShowHelp((v) => !v);
          break;
        case "Escape":
          if (showHelp) {
            e.preventDefault();
            setShowHelp(false);
          }
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, isMuted, playbackRate, isPlaying, showHelp]);

  // Track fullscreen changes
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Close speed menu and volume slider when clicking outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (showSpeedMenu) setShowSpeedMenu(false);
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [showSpeedMenu]);

  function togglePlay() {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }

  function skip(seconds: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime += seconds;
  }

  function formatTime(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }

  // Get label for current disc
  const currentDiscLabel = isMultiDisc
    ? movie?.discs?.find((d) => d.discNumber === currentDisc)?.label || `Disc ${currentDisc}`
    : null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Build video src with disc param
  const videoSrc = isMultiDisc
    ? `/api/movies/${movieId}/stream?disc=${currentDisc}`
    : `/api/movies/${movieId}/stream`;

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full bg-black overflow-hidden ${!showControls ? "cursor-none" : ""}`}
      onMouseMove={resetControlsTimer}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        key={videoSrc}
        className="h-full w-full"
        src={videoSrc}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => {
          setDuration(videoRef.current?.duration || 0);
          // Auto-play when advancing to next disc
          if (isPlaying || currentDisc > 1) {
            videoRef.current?.play();
          }
        }}
        onEnded={() => {
          if (isMultiDisc && currentDisc < totalDiscs) {
            // Auto-advance to next disc
            const nextDisc = currentDisc + 1;
            saveProgress.mutate({ seconds: 0, disc: nextDisc });
            setCurrentDisc(nextDisc);
            setCurrentTime(0);
          } else {
            // Final disc or single disc: mark as played, reset
            saveProgress.mutate({ seconds: 0, disc: 1 });
            fetch(`/api/movies/${movieId}/user-data`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isPlayed: true, currentDisc: 1 }),
            });
          }
        }}
      />

      {/* Top bar */}
      <div
        className={`absolute inset-x-0 top-0 flex h-20 items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-8 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (videoRef.current) saveProgress.mutate({ seconds: videoRef.current.currentTime, disc: currentDisc });
              router.back();
            }}
            className="text-white/80 hover:text-white"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <span className="text-base font-medium text-white">
            {movie?.title || ""}
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
            onClick={() => setShowHelp((v) => !v)}
            className="text-white/40 hover:text-white/80"
            title="Keyboard shortcuts (?)"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Center play button (on pause) */}
      {!isPlaying && !osdMessage && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/20">
            <Play className="h-8 w-8 text-white" />
          </div>
        </div>
      )}

      {/* OSD overlay */}
      {osdMessage && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-black/70 px-6 py-3 text-lg font-medium text-white">
            {osdMessage}
          </div>
        </div>
      )}

      {/* Help overlay */}
      {showHelp && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={(e) => {
            e.stopPropagation();
            setShowHelp(false);
          }}
        >
          <div
            className="relative max-h-[80vh] w-[480px] overflow-y-auto rounded-xl bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
              <button
                onClick={() => setShowHelp(false)}
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
      )}

      {/* Bottom controls */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/80 to-transparent px-8 pb-6 pt-4 transition-opacity duration-300 ${
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
            if (videoRef.current) videoRef.current.currentTime = ratio * duration;
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
        </div>

        <div className="flex items-center justify-between">
          {/* Time */}
          <span className="min-w-[120px] text-sm text-white/80">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Center controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => { skip(-10); showOsd("−10s"); }}
              className="text-white/80 hover:text-white"
              title="Rewind 10s"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button onClick={togglePlay} className="text-white hover:text-white/90">
              {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
            </button>
            <button
              onClick={() => { skip(10); showOsd("+10s"); }}
              className="text-white/80 hover:text-white"
              title="Forward 10s"
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            {/* Speed control */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSpeedMenu(!showSpeedMenu);
                }}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-sm ${
                  playbackRate !== 1
                    ? "bg-white/20 text-white"
                    : "text-white/60 hover:text-white"
                }`}
                title="Playback speed"
              >
                <Gauge className="h-4 w-4" />
                <span className="text-xs">{playbackRate}x</span>
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
                        changeSpeed(rate);
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
              className="relative flex items-center"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button
                onClick={toggleMute}
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
                <div className="ml-2 flex w-20 items-center">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => changeVolume(parseFloat(e.target.value))}
                    className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/30 accent-primary [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                  />
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white/60 hover:text-white"
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

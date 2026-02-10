"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRef, useEffect, useCallback, useState } from "react";
import {
  Play,
  Pause,
  ArrowLeft,
  Volume2,
  Maximize,
  SkipBack,
  SkipForward,
} from "lucide-react";

interface MovieData {
  id: string;
  title: string;
  playbackPositionSeconds?: number;
}

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const movieId = params.id as string;
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data: movie } = useQuery<MovieData>({
    queryKey: ["movie-player", movieId],
    queryFn: () => fetch(`/api/movies/${movieId}`).then((r) => r.json()),
  });

  const saveProgress = useMutation({
    mutationFn: (seconds: number) =>
      fetch(`/api/movies/${movieId}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playbackPositionSeconds: Math.floor(seconds) }),
      }),
  });

  // Auto-save progress every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && isPlaying) {
        saveProgress.mutate(videoRef.current.currentTime);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, movieId, saveProgress]);

  // Restore position on load
  useEffect(() => {
    if (movie?.playbackPositionSeconds && videoRef.current) {
      videoRef.current.currentTime = movie.playbackPositionSeconds;
    }
  }, [movie?.playbackPositionSeconds]);

  // Hide controls after inactivity
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen bg-black"
      onMouseMove={resetControlsTimer}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        className="h-full w-full"
        src={`/api/movies/${movieId}/stream`}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onEnded={() => {
          saveProgress.mutate(0);
          fetch(`/api/movies/${movieId}/user-data`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isPlayed: true }),
          });
        }}
      />

      {/* Top bar */}
      <div
        className={`absolute inset-x-0 top-0 flex h-20 items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-8 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (videoRef.current) saveProgress.mutate(videoRef.current.currentTime);
              router.back();
            }}
            className="text-white/80 hover:text-white"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <span className="text-base font-medium text-white">
            {movie?.title || ""}
          </span>
        </div>
        <span className="text-sm text-white/60">Kubby</span>
      </div>

      {/* Center play button (on pause) */}
      {!isPlaying && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white/20">
            <Play className="h-8 w-8 text-white" />
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/80 to-transparent px-8 pb-6 pt-4 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0"
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
          <span className="text-sm text-white/80">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Center controls */}
          <div className="flex items-center gap-4">
            <button onClick={() => skip(-10)} className="text-white/80 hover:text-white">
              <SkipBack className="h-5 w-5" />
            </button>
            <button onClick={togglePlay} className="text-white hover:text-white/90">
              {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7" />}
            </button>
            <button onClick={() => skip(10)} className="text-white/80 hover:text-white">
              <SkipForward className="h-5 w-5" />
            </button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            <button className="text-white/60 hover:text-white">
              <Volume2 className="h-5 w-5" />
            </button>
            <button onClick={toggleFullscreen} className="text-white/60 hover:text-white">
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

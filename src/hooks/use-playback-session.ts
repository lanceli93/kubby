"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Hls from "hls.js";

export interface UsePlaybackSessionOptions {
  movieId: string;
  currentDisc: number;
  isMultiDisc: boolean;
  selectedMaxWidth: number;
  startAt: number;
  showOsd: (msg: string) => void;
}

export interface UsePlaybackSessionReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playbackMode: "direct" | "remux" | "transcode" | null;
  encoderName: string | null;
  sourceVideoWidth: number | null;
  currentTime: number;
  setCurrentTime: (t: number) => void;
  duration: number;
  setDuration: (d: number) => void;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  getRealTime: () => number;
  seekTo: (seconds: number) => void;
  skip: (seconds: number) => void;
  togglePlay: () => void;
  hlsSeekingRef: React.RefObject<boolean>;
  hlsTimeOffsetRef: React.RefObject<number>;
  hlsDurationRef: React.RefObject<number | null>;
  pendingSeekRef: React.RefObject<number | null>;
  sessionIdRef: React.RefObject<string | null>;
  hlsRef: React.RefObject<Hls | null>;
  heartbeatRef: React.RefObject<ReturnType<typeof setInterval> | null>;
  freezeCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  changeResolution: (maxWidth: number) => Promise<void>;
}

export function usePlaybackSession({
  movieId,
  currentDisc,
  isMultiDisc,
  selectedMaxWidth,
  startAt,
  showOsd,
}: UsePlaybackSessionOptions): UsePlaybackSessionReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const hlsTimeOffsetRef = useRef(0);
  const hlsDurationRef = useRef<number | null>(null);
  const hlsSeekingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const seekCounterRef = useRef(0);
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekAbortRef = useRef<AbortController | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [playbackMode, setPlaybackMode] = useState<"direct" | "remux" | "transcode" | null>(null);
  const [encoderName, setEncoderName] = useState<string | null>(null);
  const [sourceVideoWidth, setSourceVideoWidth] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const getRealTime = useCallback(() => {
    return (videoRef.current?.currentTime || 0) + hlsTimeOffsetRef.current;
  }, []);

  // A <canvas> rendered on top of the <video> by the page component.
  // We draw the current frame to it *synchronously* before destroying old
  // HLS, so it covers the video element during the MediaSource swap.
  // Using direct DOM manipulation avoids React re-render latency.
  const freezeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const setFreezeFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = freezeCanvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      canvas.style.display = "block";
    } catch {
      // Canvas tainted or other error — ignore
    }
  }, []);

  const clearFreezeFrame = useCallback(() => {
    const canvas = freezeCanvasRef.current;
    if (canvas) canvas.style.display = "none";
  }, []);

  const seekTo = useCallback(
    (targetSeconds: number) => {
      if (!videoRef.current) return;
      const clamped = Math.max(0, targetSeconds);

      if (!sessionIdRef.current || !hlsRef.current) {
        videoRef.current.currentTime = clamped;
        return;
      }

      hlsSeekingRef.current = true;
      hlsTimeOffsetRef.current = Math.floor(clamped);
      setCurrentTime(Math.floor(clamped));
      showOsd("Seeking...");

      if (seekDebounceRef.current) {
        clearTimeout(seekDebounceRef.current);
      }

      seekDebounceRef.current = setTimeout(() => {
        if (seekAbortRef.current) {
          seekAbortRef.current.abort();
        }
        const controller = new AbortController();
        seekAbortRef.current = controller;

        const counter = ++seekCounterRef.current;

        const oldHls = hlsRef.current;
        hlsRef.current = null;
        // Snapshot current frame so poster fills the gap during HLS swap
        setFreezeFrame();

        fetch(`/api/stream/${sessionIdRef.current}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "seek", seekToSeconds: Math.floor(clamped) }),
          signal: controller.signal,
        })
          .then((r) => r.json())
          .then((data) => {
            if (seekCounterRef.current !== counter) {
              oldHls?.destroy();
              return;
            }
            if (data.sessionId && videoRef.current) {
              sessionIdRef.current = data.sessionId;
              hlsTimeOffsetRef.current = Math.floor(clamped);
              setCurrentTime(Math.floor(clamped));

              if (Hls.isSupported()) {
                const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
                hlsRef.current = hls;
                hls.loadSource(data.hlsUrl);
                oldHls?.destroy();
                hls.attachMedia(videoRef.current);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                  hlsSeekingRef.current = false;
                  clearFreezeFrame();
                  videoRef.current?.play().catch(() => {});
                });
                hls.on(Hls.Events.ERROR, (_event, errorData) => {
                  if (errorData.fatal && errorData.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    if (hlsSeekingRef.current) return;
                    const realTime = getRealTime();
                    if (realTime > 0 && sessionIdRef.current) {
                      seekTo(realTime);
                    }
                  }
                });
              } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
                oldHls?.destroy();
                videoRef.current.src = data.hlsUrl;
                hlsSeekingRef.current = false;
              }
            } else {
              oldHls?.destroy();
            }
          })
          .catch((err) => {
            oldHls?.destroy();
            if (err?.name === "AbortError") return;
            hlsSeekingRef.current = false;
          });
      }, 500);
    },
    [showOsd, getRealTime],
  );

  const skip = useCallback(
    (seconds: number) => {
      if (!videoRef.current) return;
      const realTarget = getRealTime() + seconds;
      if (hlsTimeOffsetRef.current > 0 && realTarget < hlsTimeOffsetRef.current && sessionIdRef.current && hlsRef.current) {
        seekTo(Math.max(0, realTarget));
      } else {
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + seconds);
      }
    },
    [getRealTime, seekTo],
  );

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, []);

  const changeResolution = useCallback(
    async (maxWidth: number) => {
      const realTime = Math.floor(getRealTime());
      const oldHls = hlsRef.current;
      hlsRef.current = null;
      setFreezeFrame();

      if (sessionIdRef.current) {
        await fetch(`/api/stream/${sessionIdRef.current}`, { method: "DELETE" });
      }

      const qp = new URLSearchParams();
      if (isMultiDisc) qp.set("disc", String(currentDisc));
      if (realTime > 0) qp.set("startAt", String(realTime));
      if (maxWidth > 0) qp.set("maxWidth", String(maxWidth));
      const qs = qp.toString();

      const res = await fetch(`/api/movies/${movieId}/stream/decide?${qs}`);
      const data = await res.json();

      if (data.sessionId && videoRef.current) {
        sessionIdRef.current = data.sessionId;
        setEncoderName(data.encoder ?? null);
        hlsTimeOffsetRef.current = realTime;
        setCurrentTime(realTime);

        if (Hls.isSupported()) {
          const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
          hlsRef.current = hls;
          hls.loadSource(data.hlsUrl);
          oldHls?.destroy();
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            clearFreezeFrame();
            videoRef.current?.play().catch(() => {});
          });
        } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
          oldHls?.destroy();
          clearFreezeFrame();
          videoRef.current.src = data.hlsUrl;
        }
      } else {
        oldHls?.destroy();
        clearFreezeFrame();
      }
    },
    [movieId, currentDisc, isMultiDisc, getRealTime],
  );

  // Decide-then-play effect
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    // Stop heartbeat for previous session
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    const oldHls = hlsRef.current;
    hlsRef.current = null;
    if (oldHls) setFreezeFrame();

    const prevSession = sessionIdRef.current;
    if (prevSession) {
      fetch(`/api/stream/${prevSession}`, { method: "DELETE", keepalive: true });
      sessionIdRef.current = null;
    }

    hlsTimeOffsetRef.current = 0;
    setPlaybackMode(null);

    const queryParams = new URLSearchParams();
    if (isMultiDisc) queryParams.set("disc", String(currentDisc));
    if (startAt > 0) queryParams.set("startAt", String(startAt));
    if (selectedMaxWidth > 0) queryParams.set("maxWidth", String(selectedMaxWidth));
    const queryStr = queryParams.toString();

    fetch(`/api/movies/${movieId}/stream/decide${queryStr ? `?${queryStr}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) {
          oldHls?.destroy();
          return;
        }

        if (data.warning) {
          showOsd(data.warning);
        }

        setPlaybackMode(data.mode);
        setEncoderName(data.encoder ?? null);
        setSourceVideoWidth(data.videoWidth ?? null);

        if (data.durationSeconds && data.mode !== "direct") {
          hlsDurationRef.current = data.durationSeconds;
          setDuration(data.durationSeconds);
        } else {
          hlsDurationRef.current = null;
        }

        if (data.mode === "direct") {
          oldHls?.destroy();
          clearFreezeFrame();
          video.src = data.directUrl;
          if (startAt > 0) {
            pendingSeekRef.current = startAt;
          }
        } else {
          sessionIdRef.current = data.sessionId;
          const hlsUrl = data.hlsUrl;

          if (heartbeatRef.current) clearInterval(heartbeatRef.current);
          heartbeatRef.current = setInterval(() => {
            if (sessionIdRef.current) {
              fetch(`/api/stream/${sessionIdRef.current}`, { method: "PATCH" }).catch(() => {});
            }
          }, 30_000);

          if (startAt > 0) {
            hlsTimeOffsetRef.current = startAt;
            setCurrentTime(startAt);
          }

          if (Hls.isSupported()) {
            const hls = new Hls({
              maxBufferLength: 30,
              maxMaxBufferLength: 60,
            });
            hlsRef.current = hls;
            hls.loadSource(hlsUrl);
            oldHls?.destroy();
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              clearFreezeFrame();
            });

            hls.on(Hls.Events.ERROR, (_event, errorData) => {
              if (errorData.fatal && errorData.type === Hls.ErrorTypes.NETWORK_ERROR) {
                if (hlsSeekingRef.current) return;
                const realTime = getRealTime();
                if (realTime > 0 && sessionIdRef.current) {
                  seekTo(realTime);
                }
              }
            });

            showOsd(data.mode === "remux" ? "Remuxing..." : "Transcoding...");
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            oldHls?.destroy();
            clearFreezeFrame();
            video.src = hlsUrl;
            showOsd(data.mode === "remux" ? "Remuxing..." : "Transcoding...");
          }
        }
      })
      .catch(() => {
        oldHls?.destroy();
        clearFreezeFrame();
        if (cancelled) return;
        const directUrl = isMultiDisc
          ? `/api/movies/${movieId}/stream?disc=${currentDisc}`
          : `/api/movies/${movieId}/stream`;
        video.src = directUrl;
        setPlaybackMode("direct");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId, currentDisc, startAt, selectedMaxWidth]);

  // Cleanup on unmount
  useEffect(() => {
    const cleanup = () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (seekDebounceRef.current) {
        clearTimeout(seekDebounceRef.current);
        seekDebounceRef.current = null;
      }
      if (seekAbortRef.current) {
        seekAbortRef.current.abort();
        seekAbortRef.current = null;
      }
      if (sessionIdRef.current) {
        fetch(`/api/stream/${sessionIdRef.current}`, { method: "DELETE", keepalive: true });
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };

    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("beforeunload", cleanup);
      cleanup();
    };
  }, []);

  return {
    videoRef,
    playbackMode,
    encoderName,
    sourceVideoWidth,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    isPlaying,
    setIsPlaying,
    getRealTime,
    seekTo,
    skip,
    togglePlay,
    hlsSeekingRef,
    hlsTimeOffsetRef,
    hlsDurationRef,
    pendingSeekRef,
    sessionIdRef,
    hlsRef,
    heartbeatRef,
    freezeCanvasRef,
    changeResolution,
  };
}

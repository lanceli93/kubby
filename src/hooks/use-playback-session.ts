"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Hls from "hls.js";

export interface UsePlaybackSessionOptions {
  movieId: string;
  currentDisc: number;
  isMultiDisc: boolean;
  selectedMaxWidth: number;
  startAt: number;
  ready: boolean;
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
  reportTimeUpdate: () => void;
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
  ready,
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
  const seekInFlightRef = useRef(false);
  const queuedSeekRef = useRef<number | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const keyframesRef = useRef<number[] | null>(null);
  // After a keyframe-snapped seek lands BEFORE the requested position, the
  // progress bar keeps showing the requested position until playback catches
  // up — moving it backwards to the snapped keyframe reads as a glitch.
  const displayHoldRef = useRef<{ time: number; expiresAt: number } | null>(null);

  const [playbackMode, setPlaybackMode] = useState<"direct" | "remux" | "transcode" | null>(null);
  const [encoderName, setEncoderName] = useState<string | null>(null);
  const [sourceVideoWidth, setSourceVideoWidth] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const getRealTime = useCallback(() => {
    return (videoRef.current?.currentTime || 0) + hlsTimeOffsetRef.current;
  }, []);

  // timeupdate → UI. Respects a post-seek display hold: while playback is
  // still behind the requested seek position (keyframe snap lands early),
  // the bar stays at the requested position instead of jumping backwards.
  const reportTimeUpdate = useCallback(() => {
    if (hlsSeekingRef.current) return;
    const real = getRealTime();
    const hold = displayHoldRef.current;
    if (hold) {
      if (real < hold.time && performance.now() < hold.expiresAt) return;
      displayHoldRef.current = null;
    }
    setCurrentTime(real);
  }, [getRealTime]);

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
      displayHoldRef.current = null;

      // Direct play (no HLS session) — snap the target to the nearest source
      // keyframe when the index is loaded. A precise (non-keyframe) seek forces
      // the browser to decode every frame from the previous keyframe; on 8K
      // HEVC with 6s GOPs that stalls playback for seconds per seek.
      if (!sessionIdRef.current) {
        let target = clamped;
        const kfs = keyframesRef.current;
        if (kfs && kfs.length > 0) {
          let lo = 0, hi = kfs.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (kfs[mid] <= clamped) lo = mid; else hi = mid - 1;
          }
          const prev = kfs[lo];
          const next = lo + 1 < kfs.length ? kfs[lo + 1] : null;
          target = next !== null && next - clamped < clamped - prev ? next : prev;
        }
        videoRef.current.currentTime = target;
        if (target < clamped) {
          // Snapped to a keyframe before the release point — keep the bar at
          // the release point until playback catches up, instead of jerking
          // it backwards by up to half a GOP.
          displayHoldRef.current = { time: clamped, expiresAt: performance.now() + 8000 };
          setCurrentTime(clamped);
        } else {
          setCurrentTime(target);
        }
        return;
      }

      // Fast path: target is inside the already-generated range of the current
      // HLS session (EVENT playlist keeps every segment since session start).
      // A local currentTime seek is near-instant vs. killing + restarting FFmpeg.
      // Skipped while a server-side seek is in flight — the video element still
      // holds the dying session's MediaSource, so its seekable range is stale.
      const video = videoRef.current;
      if (!seekInFlightRef.current && !hlsSeekingRef.current) {
        const localTarget = clamped - hlsTimeOffsetRef.current;
        const seekableEnd = video.seekable.length > 0 ? video.seekable.end(video.seekable.length - 1) : 0;
        if (localTarget >= 0 && localTarget <= seekableEnd) {
          video.currentTime = localTarget;
          setCurrentTime(clamped);
          return;
        }
      }

      // Native HLS (session exists but no hls.js instance) — server-side seek
      // needed because the playlist may not have generated segments up to the
      // target position yet, so video.currentTime alone would clamp to the
      // furthest available segment.
      const isNativeHls = !hlsRef.current;

      hlsSeekingRef.current = true;
      // Keep fractional seconds — flooring here makes the progress bar flick
      // backwards on release (drag position → floored position → real position)
      hlsTimeOffsetRef.current = clamped;
      setCurrentTime(clamped);
      showOsd("Seeking...");

      // If a seek is already in flight, queue this one instead of aborting.
      // Aborting causes the client to miss the new sessionId while the server
      // already deleted the old session → subsequent seeks 404.
      if (seekInFlightRef.current) {
        queuedSeekRef.current = clamped;
        if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
        return;
      }

      if (seekDebounceRef.current) {
        clearTimeout(seekDebounceRef.current);
      }

      seekDebounceRef.current = setTimeout(() => {
        seekInFlightRef.current = true;

        const oldHls = hlsRef.current;
        hlsRef.current = null;
        oldHls?.stopLoad();
        if (!isNativeHls) setFreezeFrame();

        fetch(`/api/stream/${sessionIdRef.current}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "seek", seekToSeconds: clamped }),
        })
          .then((r) => {
            if (!r.ok) return null;
            return r.json();
          })
          .then((data) => {
            if (data?.sessionId && videoRef.current) {
              sessionIdRef.current = data.sessionId;
              hlsTimeOffsetRef.current = clamped;
              setCurrentTime(clamped);

              // Native HLS (HEVC on iOS) — set src directly
              if (isNativeHls) {
                videoRef.current.src = data.hlsUrl;
                videoRef.current.play().catch(() => {});
                hlsSeekingRef.current = false;
              } else if (Hls.isSupported()) {
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
          .catch(() => {
            hlsSeekingRef.current = false;
          })
          .finally(() => {
            seekInFlightRef.current = false;
            // Process queued seek if user dragged again during this seek
            if (queuedSeekRef.current !== null) {
              const next = queuedSeekRef.current;
              queuedSeekRef.current = null;
              seekTo(next);
            }
          });
      }, 200);
    },
    [showOsd, getRealTime],
  );

  const skip = useCallback(
    (seconds: number) => {
      if (!videoRef.current) return;
      const realTarget = getRealTime() + seconds;
      // For native HLS (hlsRef is null but session exists), always use seekTo
      // so the server creates a new session from the target position
      const isNativeHls = sessionIdRef.current && !hlsRef.current;
      if (isNativeHls) {
        seekTo(Math.max(0, realTarget));
      } else if (hlsTimeOffsetRef.current > 0 && realTarget < hlsTimeOffsetRef.current && sessionIdRef.current && hlsRef.current) {
        seekTo(Math.max(0, realTarget));
      } else if (!sessionIdRef.current && keyframesRef.current) {
        // Direct play with a keyframe index — go through seekTo for snapping
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
      const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (iosDevice) {
        qp.set("noHevc", "1");
      } else {
        const tv = document.createElement("video");
        const hevc = tv.canPlayType('video/mp4; codecs="hvc1"')
          || tv.canPlayType('video/mp4; codecs="hev1"')
          || tv.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"');
        if (!hevc) {
          qp.set("noHevc", "1");
        }
      }
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
    if (!ready) return;
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
    // iOS reports HEVC support via canPlayType but can't reliably direct-play
    // HEVC MP4 over HTTP range requests — force HLS transcode on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      queryParams.set("noHevc", "1");
    } else {
      const testVid = document.createElement("video");
      const hevcSupport = testVid.canPlayType('video/mp4; codecs="hvc1"')
        || testVid.canPlayType('video/mp4; codecs="hev1"')
        || testVid.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"');
      if (!hevcSupport) {
        queryParams.set("noHevc", "1");
      }
    }
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

        // Debug: log decide response and attach video error handler
        console.log("[player] decide:", data);
        if (data.debug) {
          const d = data.debug;
          showOsd(`${data.mode} | ${d.videoCodec}/${d.audioCodec} ${d.container} ${d.videoWidth}x${d.videoHeight}`);
        }
        const errorHandler = () => {
          const err = video.error;
          const codes: Record<number, string> = { 1: "ABORTED", 2: "NETWORK", 3: "DECODE", 4: "SRC_NOT_SUPPORTED" };
          const msg = `Video error: ${codes[err?.code ?? 0] || err?.code} ${err?.message || ""}`;
          console.error("[player]", msg, "src:", video.src?.slice(0, 100));
          showOsd(msg);
        };
        video.removeEventListener("error", errorHandler);
        video.addEventListener("error", errorHandler);

        if (data.mode === "direct") {
          oldHls?.destroy();
          clearFreezeFrame();
          video.src = data.directUrl;
          if (startAt > 0) {
            pendingSeekRef.current = startAt;
          }
          // Load the source keyframe index in the background so seeks can
          // snap to keyframes (near-instant) instead of precise-seeking.
          // Only for 4K+ sources — precise seeking is fast enough below that,
          // and snapping costs up to half a GOP of accuracy.
          keyframesRef.current = null;
          if ((data.videoWidth ?? 0) >= 3840) {
            const discQs = isMultiDisc ? `?disc=${currentDisc}` : "";
            fetch(`/api/movies/${movieId}/keyframes${discQs}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((kf) => {
                if (!cancelled && kf?.keyframes?.length) {
                  keyframesRef.current = kf.keyframes;
                }
              })
              .catch(() => {});
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

          // HEVC HLS must use native player — hls.js/MSE doesn't support HEVC codec
          const isHevcStream = data.videoCodec && /^(hevc|h265)$/i.test(data.videoCodec);
          const useNativeHls = isHevcStream && video.canPlayType("application/vnd.apple.mpegurl");

          if (useNativeHls) {
            oldHls?.destroy();
            clearFreezeFrame();
            video.src = hlsUrl;
            showOsd(data.mode === "remux" ? "Remuxing (native)..." : "Transcoding...");
          } else if (Hls.isSupported()) {
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
              console.error("[hls]", errorData.type, errorData.details, errorData.fatal, errorData.reason);
              if (errorData.fatal) {
                showOsd(`HLS: ${errorData.type} ${errorData.details}`);
                if (errorData.type === Hls.ErrorTypes.NETWORK_ERROR) {
                  if (hlsSeekingRef.current) return;
                  const realTime = getRealTime();
                  if (realTime > 0 && sessionIdRef.current) {
                    seekTo(realTime);
                  }
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
    // selectedMaxWidth is intentionally excluded — resolution changes are
    // handled by changeResolution(), not by re-running this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId, currentDisc, startAt, ready]);

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
    reportTimeUpdate,
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

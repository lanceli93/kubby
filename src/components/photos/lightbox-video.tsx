"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

// Inline video playback for a lightbox item. Calls the photo-domain
// /stream/decide route (parallel to the movie player's flow, but far simpler —
// no seek/resolution/heartbeat machinery, just decide → play once). On unmount
// or when the id changes the parent remounts this via `key`, so cleanup runs
// per item: pause the element, destroy the hls.js instance, and DELETE any HLS
// session the server spun up (mirrors use-playback-session's cleanup).
export function LightboxVideo({ id }: { id: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    // iOS reports HEVC support via canPlayType but can't reliably direct-play
    // HEVC MP4 over HTTP range requests — force HLS (remux) on iOS. Mirrors the
    // movie player's detection.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const params = new URLSearchParams();
    if (isIOS) {
      params.set("noHevc", "1");
    } else {
      const testVid = document.createElement("video");
      const hevcSupport =
        testVid.canPlayType('video/mp4; codecs="hvc1"') ||
        testVid.canPlayType('video/mp4; codecs="hev1"') ||
        testVid.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"');
      if (!hevcSupport) params.set("noHevc", "1");
    }
    const qs = params.toString();

    fetch(`/api/photos/${id}/stream/decide${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !videoRef.current) return;

        if (data.mode === "direct") {
          video.src = data.directUrl;
          video.play().catch(() => {});
          return;
        }

        // HLS (remux/transcode). Native player for HEVC (hls.js/MSE can't decode
        // it); hls.js elsewhere; native fallback where hls.js isn't supported.
        sessionIdRef.current = data.sessionId ?? null;
        const hlsUrl = data.hlsUrl as string;
        const isHevcStream =
          data.videoCodec && /^(hevc|h265)$/i.test(data.videoCodec);
        const canNativeHls = video.canPlayType("application/vnd.apple.mpegurl");

        if (isHevcStream && canNativeHls) {
          video.src = hlsUrl;
          video.play().catch(() => {});
        } else if (Hls.isSupported()) {
          const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
          hlsRef.current = hls;
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
          });
        } else if (canNativeHls) {
          video.src = hlsUrl;
          video.play().catch(() => {});
        }
      })
      .catch(() => {
        // Last-ditch: try the raw file (browser may still play it directly).
        if (!cancelled && videoRef.current) {
          video.src = `/api/photos/${id}/file`;
          video.play().catch(() => {});
        }
      });

    return () => {
      cancelled = true;
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // ignore teardown races
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (sessionIdRef.current) {
        fetch(`/api/stream/${sessionIdRef.current}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
        sessionIdRef.current = null;
      }
    };
  }, [id]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      playsInline
      className="max-h-full max-w-full"
    />
  );
}

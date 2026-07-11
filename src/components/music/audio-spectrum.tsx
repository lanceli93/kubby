"use client";

import { useEffect, useRef } from "react";
import { ensureAnalyser } from "@/providers/music-player-provider";

interface AudioSpectrumProps {
  className?: string;
  bars?: number; // default 48
  color?: string; // CSS color for bars; default "var(--primary)"
}

// The lower FFT bins carry the musical energy; the top bins are mostly empty for
// most tracks. With fftSize 256 (128 bins) we spread the first ~96 bins across
// the bars, averaging the pair that maps to each bar.
const USABLE_BINS = 96;

/**
 * AudioSpectrum — a real-time frequency spectrum drawn on a <canvas>, tapping
 * the persistent <audio> via the provider's `ensureAnalyser()`. Bars grow
 * upward from the bottom, QQ-Music style (thin bars).
 *
 * Never disconnects the Web Audio graph (the element is a shared singleton), so
 * unmounting only cancels the rAF loop — audio keeps playing. If the analyser
 * can't be created (autoplay-blocked context, unsupported browser) OR the user
 * prefers reduced motion, it renders a static faint bar row instead.
 */
export function AudioSpectrum({
  className,
  bars = 48,
  color = "var(--primary)",
}: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let cancelled = false;
    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array<ArrayBuffer> | null = null;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Size the backing store to the CSS box × DPR so bars stay crisp, then
    // scale the context once so all drawing uses CSS pixels. Returns the CSS
    // width/height for layout math.
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      return { w: rect.width, h: rect.height };
    };

    // A flat, faint idle row — the fallback when there's no analyser or the
    // user prefers reduced motion.
    const drawIdle = () => {
      const { w, h } = resize();
      ctx.clearRect(0, 0, w, h);
      const gap = 2;
      const barWidth = Math.max(1, (w - gap * (bars - 1)) / bars);
      const barHeight = Math.max(2, h * 0.12);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        const x = i * (barWidth + gap);
        ctx.fillRect(x, h - barHeight, barWidth, barHeight);
      }
      ctx.globalAlpha = 1;
    };

    const drawFrame = () => {
      if (cancelled || !analyser || !dataArray) return;
      analyser.getByteFrequencyData(dataArray);
      const { w, h } = resize();
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const gap = 2;
      const barWidth = Math.max(1, (w - gap * (bars - 1)) / bars);
      // Map `bars` bars across the usable bins, averaging the bins that fall
      // into each bar's slice.
      const perBar = USABLE_BINS / bars;
      for (let i = 0; i < bars; i++) {
        const start = Math.floor(i * perBar);
        const end = Math.max(start + 1, Math.floor((i + 1) * perBar));
        let sum = 0;
        for (let b = start; b < end; b++) sum += dataArray[b];
        const value = sum / (end - start) / 255; // 0–1
        const barHeight = Math.max(2, value * h);
        const x = i * (barWidth + gap);
        ctx.fillRect(x, h - barHeight, barWidth, barHeight);
      }
      raf = requestAnimationFrame(drawFrame);
    };

    if (reducedMotion) {
      drawIdle();
      const onResize = () => drawIdle();
      window.addEventListener("resize", onResize);
      return () => {
        cancelled = true;
        window.removeEventListener("resize", onResize);
      };
    }

    // Idle look until the analyser resolves (or if it never does).
    drawIdle();
    const onResize = () => {
      if (analyser && dataArray) return; // the rAF loop repaints on resize
      drawIdle();
    };
    window.addEventListener("resize", onResize);

    ensureAnalyser().then((a) => {
      if (cancelled) return;
      if (!a) {
        drawIdle();
        return;
      }
      analyser = a;
      dataArray = new Uint8Array(new ArrayBuffer(a.frequencyBinCount));
      raf = requestAnimationFrame(drawFrame);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      // NEVER disconnect the analyser graph — the <audio> is a shared singleton
      // and disconnecting would silence all playback.
    };
  }, [bars, color]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}

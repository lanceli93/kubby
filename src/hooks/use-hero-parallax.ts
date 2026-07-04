"use client";

import { useEffect, useRef } from "react";

/**
 * useHeroParallax — multi-layer depth for the movie detail hero.
 *
 * Drives two independent parallax layers via direct ref DOM mutation (never
 * React state, so scrolling/hovering never re-renders the page):
 *
 *  - Fanart layer: translates DOWN as the scroll container scrolls (a fraction
 *    of scrollTop, so the background sinks behind the foreground) and drifts a
 *    few px OPPOSITE the pointer.
 *  - Poster layer: drifts a few px WITH the pointer, in the same direction but
 *    smaller magnitude, opening a depth gap against the fanart.
 *
 * Scroll motion is applied 1:1 (scroll-linked, must not lag); only the pointer
 * drift is critically-damped (τ 90ms) in the shared frame loop so a fast entry
 * eases in instead of snapping.
 *
 * The page scrolls inside a `overflow-y-scroll` div (NOT window), so the scroll
 * listener attaches to `scrollRef`, not `window`.
 *
 * CAUTION — `backdrop-filter` breaks under a transformed ancestor (the transform
 * establishes a new containing block). Attach `posterRef` to a wrapper that is
 * NOT an ancestor of the glass movie-info panel; keep `fanartRef` on the fanart
 * image wrapper only. Never point either ref at a node that contains the panel.
 *
 * Degradation: no parallax on coarse pointers (touch), below `md`, or when the
 * user prefers reduced motion — layers stay flat, identical to today. Passing
 * `disabled` (e.g. while fanart-fullscreen mode is on) resets and suspends it.
 */

// Scroll depth: fanart sinks at this fraction of the scroll offset.
const SCROLL_FACTOR = 0.35;
// Pointer drift magnitudes (px) — fanart moves more (deeper), poster less.
const FANART_DRIFT = 10;
const POSTER_DRIFT = 5;
// Damping time constant (ms) for the pointer drift: current eases toward target
// at 1 - exp(-dt/TAU). Scroll stays immediate; only dx/dy are smoothed.
const TAU = 90;

interface UseHeroParallaxOptions {
  /** Suspend and reset parallax (e.g. while fanart-fullscreen mode is active). */
  disabled?: boolean;
  /**
   * Flip to true once the ref'd elements are actually rendered. The detail page
   * early-returns a loading state before `movie` arrives, so on first mount the
   * refs are null and listener effects would bind to nothing; they re-run when
   * this becomes true.
   */
  ready?: boolean;
}

export function useHeroParallax({ disabled, ready = true }: UseHeroParallaxOptions = {}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const fanartRef = useRef<HTMLDivElement>(null);
  const posterRef = useRef<HTMLDivElement>(null);
  // Scroll offset is applied 1:1 (immediate); pointer drift is smoothed —
  // `current` lerps toward `target` inside the frame loop.
  const scrollYRef = useRef(0);
  const targetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const currentRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  // Whether parallax is allowed (fine pointer + md+ + motion not reduced).
  const enabledRef = useRef(false);

  // Combine immediate scrollY with the smoothed pointer drift, then write the
  // layer transforms. Keeps looping while dx/dy is easing; stops once settled.
  const tick = (ts: number) => {
    const last = lastTsRef.current ?? ts;
    const dt = ts - last;
    lastTsRef.current = ts;
    const k = 1 - Math.exp(-dt / TAU);
    const target = targetRef.current;
    const cur = currentRef.current;
    cur.dx += (target.dx - cur.dx) * k;
    cur.dy += (target.dy - cur.dy) * k;
    // Drift settles below sub-pixel motion at both layers' magnitudes.
    const settled =
      Math.abs(target.dx - cur.dx) < 0.05 && Math.abs(target.dy - cur.dy) < 0.05;
    if (settled) {
      cur.dx = target.dx;
      cur.dy = target.dy;
    }
    const scrollY = scrollYRef.current;
    const fanart = fanartRef.current;
    if (fanart) {
      // Sink with scroll, drift opposite the pointer.
      fanart.style.transform = `translate3d(${-cur.dx * FANART_DRIFT}px, ${
        scrollY * SCROLL_FACTOR - cur.dy * FANART_DRIFT
      }px, 0)`;
    }
    const poster = posterRef.current;
    if (poster) {
      // Drift with the pointer (same direction, smaller magnitude).
      poster.style.transform = `translate3d(${cur.dx * POSTER_DRIFT}px, ${
        cur.dy * POSTER_DRIFT
      }px, 0)`;
    }
    if (settled) {
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  // Kick the loop (used by both scroll and pointer). Scroll needs a frame even
  // when drift is already settled, so this always ensures one runs.
  const schedule = () => {
    if (rafRef.current == null) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const reset = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
    scrollYRef.current = 0;
    targetRef.current = { dx: 0, dy: 0 };
    currentRef.current = { dx: 0, dy: 0 };
    const fanart = fanartRef.current;
    if (fanart) fanart.style.transform = "";
    const poster = posterRef.current;
    if (poster) poster.style.transform = "";
  };

  // Track whether interactive parallax is allowed.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const fine = window.matchMedia("(pointer: fine)");
    const wide = window.matchMedia("(min-width: 768px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const next = fine.matches && wide.matches && !reduce.matches;
      enabledRef.current = next;
      if (!next) reset();
    };
    update();
    fine.addEventListener("change", update);
    wide.addEventListener("change", update);
    reduce.addEventListener("change", update);
    return () => {
      fine.removeEventListener("change", update);
      wide.removeEventListener("change", update);
      reduce.removeEventListener("change", update);
    };
  }, []);

  // Scroll parallax on the fanart layer.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onScroll = () => {
      if (disabled || !enabledRef.current) return;
      scrollYRef.current = scroller.scrollTop;
      schedule();
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [disabled, ready]);

  // Pointer parallax over the hero.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const onMove = (e: PointerEvent) => {
      if (disabled || !enabledRef.current) return;
      const rect = hero.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // Normalized offset from center: -1..1 on each axis.
      targetRef.current = {
        dx: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
        dy: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
      };
      schedule();
    };
    const onLeave = () => {
      targetRef.current = { dx: 0, dy: 0 };
      schedule();
    };
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerleave", onLeave);
    return () => {
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerleave", onLeave);
    };
  }, [disabled, ready]);

  // Suspend + reset while disabled (e.g. fanart-fullscreen mode).
  useEffect(() => {
    if (disabled) reset();
  }, [disabled]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { scrollRef, heroRef, fanartRef, posterRef };
}

import { useSyncExternalStore } from "react";

/**
 * Root font-size scale factor (root px / 16).
 *
 * globals.css gives <html> a fluid font-size (16px up to a 1920px viewport,
 * growing to a 24px cap), so every rem-based size scales with it. Layout code
 * that works in raw px (virtualizer row heights, canvas reserves, …) multiplies
 * by this factor to stay in step with the rem-sized UI around it.
 */
export function getRootScale(): number {
  if (typeof window === "undefined") return 1;
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(px) && px > 0 ? px / 16 : 1;
}

/** Convert a design-px value into a rem string (16px = 1rem). */
export function rem(px: number): string {
  return `${px / 16}rem`;
}

// One shared resize listener for all subscribers; the cached value only
// changes (and subscribers only re-render) when the scale actually moves.
let cached = 1;
const listeners = new Set<() => void>();

function onResize() {
  const next = getRootScale();
  if (next === cached) return;
  cached = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    cached = getRootScale();
    window.addEventListener("resize", onResize);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("resize", onResize);
  };
}

function getSnapshot() {
  // Before the first subscription the cache may be stale — refresh lazily.
  if (listeners.size === 0) cached = getRootScale();
  return cached;
}

function getServerSnapshot() {
  return 1;
}

/** React hook: current root scale; 1 on the server and during hydration. */
export function useRootScale(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

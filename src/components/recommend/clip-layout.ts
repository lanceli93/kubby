import { resolveImageSrc } from "@/lib/image-utils";
import type { ClipCardData } from "@/lib/recommend/types";

/**
 * Geometry + helpers for video-bookmark "clip" cards (design D1 大幅插入 "Big
 * tuck", prototype data/demos/clips/index.html?v=d1): the parent poster is the
 * card's envelope, the bookmark frame (the "still") is tucked big into its
 * lower part behind a shallow pocket. Shared by the hand face (card-faces.tsx)
 * and the pile minis of both scenes.
 *
 * All sizes are in card widths (cw); a card is 1cw × 1.5cw.
 */

/** Still size inside maxW × maxH keeping its ratio, but never shorter than
 *  minH — ultra-wide frames (2.39, 360°) are centre-cropped up to minH instead
 *  of becoming a thin strip; tall frames (9:16) take height instead of width.
 *  360° frames get a 16:9 window. */
export function stillBox(
  aspect: number | null | undefined,
  is360: boolean,
  maxW: number,
  maxH: number,
  minH: number
): { w: number; h: number } {
  if (is360) return { w: maxW, h: Math.max(minH, maxW / (16 / 9)) };
  const a = aspect && aspect > 0 ? aspect : 16 / 9;
  let w: number;
  let h: number;
  if (a >= maxW / maxH) {
    w = maxW;
    h = maxW / a;
  } else {
    w = maxH * a;
    h = maxH;
  }
  if (h < minH) {
    h = minH;
    w = maxW;
  }
  return { w, h };
}

// D1 hand-face constants (prototype faceD1)
export const D1_MAX_W = 0.88;
export const D1_MAX_H = 0.98;
export const D1_MIN_H = 0.42;
/** the still's paper border */
export const D1_PAD = 0.016;
/** top of the info pocket, and how far the still tucks into it */
export const D1_POCKET_TOP = 1.06;
export const D1_TUCK = 0.06;
/** 360° panning loop (s) — one full turn of the equirect */
export const PANO_LOOP_S = 70;

/** FNV-1a → [0, 1) — stable per-card variation (still tilt). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Bookmark timecode: h:mm:ss, or mm:ss under an hour. */
export function formatTimecode(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Player URL for a clip — same format as components/movie/bookmark-card.tsx. */
export function clipPlayHref(c: ClipCardData): string {
  const disc = c.discNumber && c.discNumber > 1 ? `&disc=${c.discNumber}` : "";
  const vs = c.viewState
    ? `&vs=${c.viewState.lon.toFixed(2)},${c.viewState.lat.toFixed(2)},${c.viewState.fov.toFixed(0)}`
    : "&vs=off";
  return `/movies/${c.movieId}/play?t=${c.timestampSeconds}${disc}${vs}`;
}

/**
 * D1 pile mini: the parent poster + a small tucked still. Cheap on purpose —
 * two plain <img>s (no pseudo-elements, no filters; the still's border and
 * shadow are static). Sizes are percentages of the card, so a resize of the
 * host needs no update. `host` is the scene's face element (it already
 * carries the blur placeholder background).
 */
export function appendClipMini(
  host: HTMLElement,
  poster: string | null,
  still: string | null | undefined,
  stillAspect: number | null | undefined
) {
  if (poster) host.appendChild(lowImg(resolveImageSrc(poster, 200)));
  if (!still) return;
  const b = stillBox(stillAspect, false, 0.86, 0.95, 0.42);
  const img = lowImg(resolveImageSrc(still, 200));
  img.className = "rc-mini-still";
  img.style.width = `${(b.w * 100).toFixed(2)}%`;
  img.style.height = `${((b.h / 1.5) * 100).toFixed(2)}%`;
  img.style.top = `${(((1.3 - b.h) / 1.5) * 100).toFixed(2)}%`;
  host.appendChild(img);
}

function lowImg(src: string): HTMLImageElement {
  const img = document.createElement("img");
  img.decoding = "async";
  img.fetchPriority = "low"; // hand + ambient backdrop images load first
  img.draggable = false;
  img.alt = "";
  img.src = src;
  return img;
}

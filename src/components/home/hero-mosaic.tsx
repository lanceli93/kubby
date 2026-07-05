"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { resolveImageSrc } from "@/lib/image-utils";

export interface MosaicMovie {
  id: string;
  title: string;
  posterPath?: string | null;
  fanartPath?: string | null;
  posterBlur?: string | null;
}

/** Usable poster/fanart count — the same filter HeroMosaic applies internally.
 *  Exported so callers (HomeHero) can decide wall-vs-fallback without duplicating
 *  the predicate. Below 8 the wall returns null and the page uses a plain backdrop. */
export function usableWallCount(movies: MosaicMovie[]): number {
  return movies.filter((m) => m.posterPath || m.fanartPath).length;
}

// Fixed 16-column wall (dense — ~7-8 columns visible after the tilt/scale).
// Each column drifts at its own pace; neighbors alternate direction so the
// wall never reads as a single scrolling sheet.
const COLUMN_COUNT = 16;
const DRIFT_DURATIONS = [
  95, 70, 110, 80, 125, 75, 100, 88, 115, 78, 105, 92, 120, 82, 98, 108,
];

// Spotlight cadence — one card lights per interval. Matches the ROTATE_MS the
// hero used for its old carousel so the rhythm is unchanged.
const SPOTLIGHT_MS = 8000;
// Small delay after mount before the first pick, so tiles have laid out and
// the drift animation has offset them from their initial positions.
const INITIAL_DELAY_MS = 400;

interface MosaicCard {
  movie: MosaicMovie;
  landscape: boolean;
}

/** One poster/fanart tile — non-interactive, lazy-loaded. When `lit` it mirrors
 *  the movie-card hover ambilight: dark scrim fades out, a blurred copy of the
 *  poster blooms behind, the ring brightens and the whole tile scales up. `tile`
 *  is a per-render-instance address ("col:i") — the duplicated loop copy of the
 *  same movie gets a distinct address so only one instance ever lights. */
function Card({
  movie,
  landscape,
  tile,
  lit,
}: MosaicCard & { tile: string; lit: boolean }) {
  // Prefer the orientation-appropriate image, fall back to the other one.
  const img = landscape
    ? movie.fanartPath || movie.posterPath
    : movie.posterPath || movie.fanartPath;
  if (!img) return null;
  const src = resolveImageSrc(img, 300);
  return (
    <div
      data-tile={tile}
      data-movie-id={movie.id}
      className={`relative w-full overflow-visible transition-transform duration-700 ease-out ${
        lit ? "z-10 scale-[1.05]" : ""
      }`}
    >
      {/* Ambient glow — blurred copy of the same poster bleeding behind the tile,
          only mounted while lit (mirrors movie-card.tsx's hover ambilight). */}
      {lit && (
        <Image
          src={src}
          alt=""
          fill
          sizes="220px"
          aria-hidden
          className="animate-fade-in pointer-events-none absolute inset-0 -z-10 scale-110 rounded-md object-cover opacity-70 blur-2xl"
        />
      )}
      <div
        className={`relative w-full overflow-hidden rounded-md ring-1 transition-[box-shadow] duration-700 ${
          lit ? "ring-2 ring-white/40" : "ring-white/10"
        } ${landscape ? "aspect-video" : "aspect-[2/3]"}`}
      >
        <Image
          src={src}
          alt=""
          fill
          sizes="220px"
          loading="lazy"
          className="object-cover"
        />
        {/* Per-tile dark scrim — opaque normally, fades out when lit. Replaces
            the old global bg-black/55 tint so a single tile can shine through. */}
        <div
          className={`absolute inset-0 bg-black/55 transition-opacity duration-700 ${
            lit ? "opacity-0" : "opacity-100"
          }`}
        />
      </div>
    </div>
  );
}

interface HeroMosaicProps {
  movies: MosaicMovie[];
  /** Called when the spotlight moves to a new tile, reporting its movie. */
  onFeature?: (movie: MosaicMovie) => void;
  /** Rotate the spotlight (default true when onFeature is provided). */
  featuredEnabled?: boolean;
}

/** Slowly drifting tilted wall of the library's own posters. One tile is
 *  "spotlit" at a time (per-card scrim fades, ambilight glow blooms) and its
 *  movie is reported via onFeature — the hero's text/ambient follow it. See
 *  components/home/home-hero.tsx for the layer stacking + how it consumes this. */
export function HeroMosaic({
  movies,
  onFeature,
  featuredEnabled = onFeature != null,
}: HeroMosaicProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Lit tile addresses — a movie's poster and its matching fanart light together,
  // so this holds the whole pair (1-2 adjacent "col:i" tiles), not a single tile.
  const [litTiles, setLitTiles] = useState<Set<string>>(() => new Set());
  // Currently featured movie id — excluded from the next pick so we don't relight
  // the same movie back-to-back (a duplicated copy elsewhere may still be chosen).
  const featuredIdRef = useRef<string | null>(null);
  // Keep onFeature in a ref so the selection timer effect stays stable.
  const onFeatureRef = useRef(onFeature);
  useEffect(() => {
    onFeatureRef.current = onFeature;
  }, [onFeature]);

  // Only usable posters/fanart; below 8 the page falls back to a plain backdrop.
  const usable = movies.filter((m) => m.posterPath || m.fanartPath);

  // Fill the columns so each movie contributes its poster immediately followed by
  // that SAME movie's fanart — during the drift a poster is always trailed by its
  // own landscape still, instead of a random poster-A / fanart-B pairing. A movie
  // with only one image contributes a single tile. The poster+fanart pair is kept
  // intact within a column (never split across the column gap), so the pairing
  // stays visually adjacent. Small pools wrap around; we skip a candidate that
  // would repeat the previous movie at a column boundary.
  const perColumn = usable.length >= 48 ? 6 : 5;
  const columns: MosaicCard[][] = Array.from({ length: COLUMN_COUNT }, () => []);
  let cursor = 0;
  for (let col = 0; col < COLUMN_COUNT; col++) {
    const stack = columns[col];
    while (stack.length < perColumn) {
      const movie = usable[cursor % usable.length];
      cursor++;
      // Avoid two identical neighbors when the pool wraps within a column.
      if (
        stack.length > 0 &&
        stack[stack.length - 1].movie.id === movie.id &&
        usable.length > 1
      ) {
        continue;
      }
      if (movie.posterPath) stack.push({ movie, landscape: false });
      if (movie.fanartPath) stack.push({ movie, landscape: true });
    }
  }

  // Per-render-instance tile→movie map: each column renders its stack twice
  // (back-to-back for the seamless loop), so the instance index `i` runs
  // 0..2*perColumn-1. The address "col:i" is unique per visible tile, letting a
  // single instance light while its loop twin stays dark. The selection loop
  // resolves a lit tile back to its movie through this map.
  //
  // tilePairs maps each tile address to the group of addresses that light
  // *together* — a movie's poster tile and its adjacent fanart tile form one
  // pair, so lighting either lights both. A movie with a single image maps to a
  // one-element group. Walking with a step of 2 over an adjacent poster+fanart
  // keeps each group to exactly that instance (never merging a loop twin).
  const tileMovies = new Map<string, MosaicMovie>();
  const tilePairs = new Map<string, string[]>();
  for (let col = 0; col < COLUMN_COUNT; col++) {
    const doubled = [...columns[col], ...columns[col]];
    doubled.forEach((card, i) => {
      tileMovies.set(`${col}:${i}`, card.movie);
    });
    for (let i = 0; i < doubled.length; ) {
      const cur = doubled[i];
      const next = doubled[i + 1];
      if (
        !cur.landscape &&
        next &&
        next.landscape &&
        next.movie.id === cur.movie.id
      ) {
        const group = [`${col}:${i}`, `${col}:${i + 1}`];
        tilePairs.set(group[0], group);
        tilePairs.set(group[1], group);
        i += 2;
      } else {
        const addr = `${col}:${i}`;
        tilePairs.set(addr, [addr]);
        i += 1;
      }
    }
  }

  // Spotlight selection loop. A self-rescheduling timer picks a tile that is
  // currently on-screen in the "spotlight zone" (right-of-center, since the text
  // block sits on the left), lights it, and reports its movie. Paused while the
  // tab is hidden; under reduced motion it fires once and never rotates.
  useEffect(() => {
    if (!featuredEnabled || usable.length < 8) return;
    const root = rootRef.current;
    if (!root) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const reduce =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    const pick = () => {
      const rect = root.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // Eligible zone: the ~5 right-of-center columns. The 2 leftmost and 2
      // rightmost visible columns read poorly (steep foreshortening at the tilted
      // wall's edges), so we exclude both edge strips and lean the band right —
      // the text block sits on the left, so the right side is the natural focus.
      // NOTE: the wall is under a perspective transform, so getBoundingClientRect
      // returns an INFLATED axis-aligned box (a tilted card's AABB is far larger
      // than the card). "Whole rect inside" is therefore never satisfiable — judge
      // by the card's CENTER with margins generous enough that a center-qualified
      // card is in practice fully visible: clear of the side edges, above the
      // bottom dissolve. (These X fractions are the knob for the lit spread —
      // widen the window to light more columns, shift it to move the focus.)
      const minX = rect.left + rect.width * 0.38;
      const maxX = rect.right - rect.width * 0.2;
      const minY = rect.top + rect.height * 0.14;
      const maxY = rect.top + rect.height * 0.66;
      const textRight = rect.left + rect.width * 0.42;
      const textTop = rect.top + rect.height * 0.4;

      const tiles = Array.from(
        root.querySelectorAll<HTMLElement>("[data-tile]")
      );
      const excludeId = featuredIdRef.current;
      const eligible: { tile: string; movieId: string }[] = [];
      const eligibleAny: { tile: string; movieId: string }[] = [];

      for (const el of tiles) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < minX || cx > maxX) continue;
        if (cy < minY || cy > maxY) continue;
        // Skip tiles that would sit behind the left text block.
        if (cx < textRight && cy > textTop) continue;
        const tile = el.dataset.tile;
        const movieId = el.dataset.movieId;
        if (!tile || !movieId) continue;
        eligibleAny.push({ tile, movieId });
        if (movieId !== excludeId) eligible.push({ tile, movieId });
      }

      // Random pick among eligible tiles (prefer a different movie than the
      // current one) — randomness keeps the spotlight wandering over the wall.
      const pool = eligible.length > 0 ? eligible : eligibleAny;
      if (pool.length === 0) return;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      const movie = tileMovies.get(chosen.tile);
      if (!movie) return;
      // Light the whole poster+fanart pair for this instance, not just the tile
      // the spotlight landed on.
      setLitTiles(new Set(tilePairs.get(chosen.tile) ?? [chosen.tile]));
      featuredIdRef.current = movie.id;
      onFeatureRef.current?.(movie);
    };

    const schedule = () => {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        if (typeof document !== "undefined" && document.hidden) {
          schedule();
          return;
        }
        pick();
        schedule();
      }, SPOTLIGHT_MS);
    };

    // Fire once shortly after mount, then rotate (unless reduced motion).
    const initial = setTimeout(() => {
      pick();
      if (!reduce?.matches) schedule();
    }, INITIAL_DELAY_MS);

    // Re-arm when the tab becomes visible again (schedule() itself no-ops picks
    // while hidden, but this resumes the cadence promptly).
    const onVisibility = () => {
      if (reduce?.matches) return;
      if (typeof document !== "undefined" && !document.hidden) schedule();
    };
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimeout(initial);
      if (timer != null) clearTimeout(timer);
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", onVisibility);
    };
    // tileMovies is rebuilt each render from `movies`; depend on the identity of
    // the movie pool (length + featuredEnabled) rather than the fresh Map/array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredEnabled, usable.length]);

  if (usable.length < 8) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Oversized tilted plane — the -inset guarantees no empty corners after
          the perspective rotation. */}
      {/* rotateX leans the wall like a painting with its bottom edge toward
          the viewer; rotateZ turns the whole painting counterclockwise for the
          Netflix-style diagonal. */}
      <div
        className="absolute -inset-[30%] flex justify-center gap-2.5 [transform:perspective(1600px)_rotateX(24deg)_rotateZ(-16deg)_scale(1.34)] [transform-origin:center] md:gap-3"
      >
        {columns.map((cards, col) => (
          <div key={col} className="flex min-w-0 flex-1 flex-col gap-3 md:gap-4">
            {/* pb equals the inner gap: with two identical halves the wrapper
                height becomes exactly 2×(set + gap), so translateY(-50%) lands
                seamlessly (plain gap alone leaves a half-gap jump per loop). */}
            <div
              className="animate-mosaic-drift flex flex-col gap-3 pb-3 [will-change:transform] motion-reduce:[animation-play-state:paused] md:gap-4 md:pb-4"
              style={{
                "--drift-dur": `${DRIFT_DURATIONS[col]}s`,
                animationDirection: col % 2 === 1 ? "reverse" : "normal",
              } as React.CSSProperties}
            >
              {/* Duplicated back-to-back for a seamless translateY(-50%) loop.
                  Each instance gets its own "col:i" address so a lit tile lights
                  only that one instance, not its loop twin. */}
              {[...cards, ...cards].map((card, i) => {
                const tile = `${col}:${i}`;
                return (
                  <Card
                    key={i}
                    movie={card.movie}
                    landscape={card.landscape}
                    tile={tile}
                    lit={litTiles.has(tile)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

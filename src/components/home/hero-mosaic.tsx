"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { resolveImageSrc } from "@/lib/image-utils";
import {
  type HeroMosaicConfig,
  type MosaicStyle,
  DEFAULT_HERO_MOSAIC_CONFIG,
  MOSAIC_ANGLES,
} from "@/lib/hero-mosaic-config";

export interface MosaicMovie {
  id: string;
  title: string;
  posterPath?: string | null;
  fanartPath?: string | null;
  posterBlur?: string | null;
}

/** Whether a movie can supply a tile for a given mosaic style — the single
 *  predicate both usableWallCount and the internal fill loop apply, so the
 *  wall-vs-fallback decision never drifts from what actually renders.
 *  "poster"/"fanart" require that one image; "both" accepts either. */
function isUsable(m: MosaicMovie, style: MosaicStyle): boolean {
  if (style === "poster") return !!m.posterPath;
  if (style === "fanart") return !!m.fanartPath;
  return !!(m.posterPath || m.fanartPath);
}

/** Usable poster/fanart count — the same filter HeroMosaic applies internally.
 *  Exported so callers (HomeHero) can decide wall-vs-fallback without duplicating
 *  the predicate. Below 8 the wall returns null and the page uses a plain backdrop.
 *  `style` (default "both") must match the config the wall will render with. */
export function usableWallCount(
  movies: MosaicMovie[],
  style: MosaicStyle = "both"
): number {
  return movies.filter((m) => isUsable(m, style)).length;
}

// Per-lane drift durations — neighbors alternate direction so the wall never
// reads as a single scrolling sheet. A "lane" is a column (vertical flow) or a
// row (horizontal flow). Fixed 16 entries: with configurable lane counts we
// index `lane % DRIFT_DURATIONS.length` so any count reuses the cadence.
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
 *  is a per-render-instance address ("lane:i") — the duplicated loop copy of the
 *  same movie gets a distinct address so only one instance ever lights.
 *  In vertical flow the lane fixes each tile's WIDTH (aspect-ratio derives the
 *  height); in horizontal flow (`horizontal`) the lane fixes each tile's HEIGHT
 *  (aspect-ratio derives the width) — the transpose keeps rows a uniform height. */
function Card({
  movie,
  landscape,
  tile,
  lit,
  horizontal = false,
}: MosaicCard & { tile: string; lit: boolean; horizontal?: boolean }) {
  // Prefer the orientation-appropriate image, fall back to the other one.
  const img = landscape
    ? movie.fanartPath || movie.posterPath
    : movie.posterPath || movie.fanartPath;
  if (!img) return null;
  const src = resolveImageSrc(img, 300);
  const aspectClass = landscape ? "aspect-video" : "aspect-[2/3]";
  return (
    <div
      data-tile={tile}
      data-movie-id={movie.id}
      className={`relative overflow-visible transition-transform duration-700 ease-out ${
        horizontal ? "h-full" : "w-full"
      } ${lit ? "z-10 scale-[1.05]" : ""}`}
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
      {/* Vertical: w-full + aspect derives the height. Horizontal: h-full +
          aspect derives the width (so every tile in a row shares the row height). */}
      <div
        className={`relative overflow-hidden rounded-md ring-1 transition-[box-shadow] duration-700 ${
          lit ? "ring-2 ring-white/40" : "ring-white/10"
        } ${horizontal ? "h-full" : "w-full"} ${aspectClass}`}
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
  /** Column count / tile style / wall angle. Defaults to today's classic wall
   *  (16 columns, poster+fanart pairing, the classic transform). */
  config?: HeroMosaicConfig;
}

/** Slowly drifting tilted wall of the library's own posters. One tile is
 *  "spotlit" at a time (per-card scrim fades, ambilight glow blooms) and its
 *  movie is reported via onFeature — the hero's text/ambient follow it. See
 *  components/home/home-hero.tsx for the layer stacking + how it consumes this. */
export function HeroMosaic({
  movies,
  onFeature,
  featuredEnabled = onFeature != null,
  config = DEFAULT_HERO_MOSAIC_CONFIG,
}: HeroMosaicProps) {
  const { columnCount, style } = config;
  const horizontal = config.flow === "horizontal";
  const rootRef = useRef<HTMLDivElement>(null);
  // Lit tile addresses — a movie's poster and its matching fanart light together,
  // so this holds the whole pair (1-2 adjacent "lane:i" tiles), not a single tile.
  const [litTiles, setLitTiles] = useState<Set<string>>(() => new Set());
  // Currently featured movie id — excluded from the next pick so we don't relight
  // the same movie back-to-back (a duplicated copy elsewhere may still be chosen).
  const featuredIdRef = useRef<string | null>(null);
  // Keep onFeature in a ref so the selection timer effect stays stable.
  const onFeatureRef = useRef(onFeature);
  useEffect(() => {
    onFeatureRef.current = onFeature;
  }, [onFeature]);

  // Only movies usable for the chosen style; below 8 the page falls back to a
  // plain backdrop.
  const usable = movies.filter((m) => isUsable(m, style));

  // Lane count. Vertical: one lane per column, so laneCount === columnCount.
  // Horizontal: columns is still the single density knob, mapped to a row count
  // (0.45 keeps rows sparser than columns since rows span the wider axis and
  // land taller: 16 cols → 7 rows), clamped to a sane 4–12.
  const laneCount = horizontal
    ? Math.min(12, Math.max(4, Math.round(columnCount * 0.45)))
    : columnCount;

  // How long a single set of tiles must be to cover the visible plane for the
  // seamless loop (one set, with its gap, ≥ the plane along the drift axis).
  // `aspect` is tile length-along-drift / cross-axis-size:
  //   Vertical (drift = height): height/width — poster 1.5, fanart 0.5625,
  //     "both" ≈ 1.03 (equal widths, heights averaged over a poster+fanart pair).
  //   Horizontal (drift = width): width/height — poster 1/1.5 ≈ 0.667, fanart
  //     1/0.5625 ≈ 1.778, "both" ≈ 0.82 (equal HEIGHTS here, so widths vary and
  //     the pair average differs from vertical's 1.03).
  // Vertical: wider walls make each column narrower, so more tiles fit; taller
  // tiles (posters) need fewer, wider tiles (fanart) need more. 0.36 ≈ the hero's
  // height/width ratio the wall must span (16 cols "both" → 7).
  // Horizontal: 2.8 ≈ the plane's W/H (hero ≈ 100vw × 64vh on 16:9; the
  // -inset-[30%] oversize preserves the ratio). More rows make each row shorter,
  // so each tile is narrower and more fit per row (7 rows "both" → ceil(2.8*7
  // *0.82)+1 = 17).
  let perLane: number;
  if (horizontal) {
    const aspect =
      style === "poster" ? 0.667 : style === "fanart" ? 1.778 : 0.82;
    perLane = Math.min(32, Math.max(6, Math.ceil(2.8 * laneCount * aspect) + 1));
  } else {
    const aspect =
      style === "poster" ? 1.5 : style === "fanart" ? 0.5625 : 1.03;
    perLane = Math.min(14, Math.max(3, Math.ceil((laneCount * 0.36) / aspect) + 1));
  }

  // Fill the lanes. For "both", each movie contributes its poster immediately
  // followed by that SAME movie's fanart — during the drift a poster is always
  // trailed by its own landscape still, instead of a random poster-A / fanart-B
  // pairing (a movie with only one image contributes a single tile). For a
  // single-style wall each movie contributes exactly one tile of that style. The
  // poster+fanart pair is kept intact within a lane (never split across the lane
  // gap), so the pairing stays visually adjacent. Small pools wrap around; we
  // skip a candidate that would repeat the previous movie at a lane boundary.
  const lanes: MosaicCard[][] = Array.from({ length: laneCount }, () => []);
  let cursor = 0;
  for (let lane = 0; lane < laneCount; lane++) {
    const stack = lanes[lane];
    while (stack.length < perLane) {
      const movie = usable[cursor % usable.length];
      cursor++;
      // Avoid two identical neighbors when the pool wraps within a lane.
      if (
        stack.length > 0 &&
        stack[stack.length - 1].movie.id === movie.id &&
        usable.length > 1
      ) {
        continue;
      }
      if (style === "poster") {
        if (movie.posterPath) stack.push({ movie, landscape: false });
      } else if (style === "fanart") {
        if (movie.fanartPath) stack.push({ movie, landscape: true });
      } else {
        if (movie.posterPath) stack.push({ movie, landscape: false });
        if (movie.fanartPath) stack.push({ movie, landscape: true });
      }
    }
  }

  // Per-render-instance tile→movie map: each lane renders its stack twice
  // (back-to-back for the seamless loop), so the instance index `i` runs
  // 0..2*perLane-1. The address "lane:i" is unique per visible tile, letting a
  // single instance light while its loop twin stays dark. The selection loop
  // resolves a lit tile back to its movie through this map.
  //
  // tilePairs maps each tile address to the group of addresses that light
  // *together* — a movie's poster tile and its adjacent fanart tile form one
  // pair, so lighting either lights both. A movie with a single image maps to a
  // one-element group. Walking with a step of 2 over an adjacent poster+fanart
  // keeps each group to exactly that instance (never merging a loop twin). A
  // single-style wall never forms poster+fanart adjacencies, so every tile falls
  // into the else branch below and maps to its own one-element group.
  const tileMovies = new Map<string, MosaicMovie>();
  const tilePairs = new Map<string, string[]>();
  for (let lane = 0; lane < laneCount; lane++) {
    const doubled = [...lanes[lane], ...lanes[lane]];
    doubled.forEach((card, i) => {
      tileMovies.set(`${lane}:${i}`, card.movie);
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
        const group = [`${lane}:${i}`, `${lane}:${i + 1}`];
        tilePairs.set(group[0], group);
        tilePairs.set(group[1], group);
        i += 2;
      } else {
        const addr = `${lane}:${i}`;
        tilePairs.set(addr, [addr]);
        i += 1;
      }
    }
  }

  // The maps above are rebuilt every render (their tile addresses shift when the
  // column count / style / flow change). The selection timer effect is armed
  // once per layout, so its closure would otherwise keep resolving lit tiles
  // against a stale render's maps — on the home page prefs (columnCount) usually
  // arrive AFTER the wall movies, re-addressing every tile, and the lit tile then
  // stops matching the reported movie. Mirror the current maps into a ref so
  // pick() always reads the live addressing, never the closure.
  const tileMapsRef = useRef({ tileMovies, tilePairs });
  tileMapsRef.current = { tileMovies, tilePairs };

  // Movies featured this session, across every re-arm — so the spotlight cycles
  // through the whole visible pool before repeating (Bug B: a narrow zone + pure
  // random meant only a handful of movies ever showed).
  const featuredHistoryRef = useRef<Set<string>>(new Set());

  // Spotlight selection loop. A self-rescheduling timer picks a tile that is
  // currently on-screen in the "spotlight zone" (nearly the whole wall, minus the
  // extreme edges and the left text block), lights it, and reports its movie.
  // Paused while the tab is hidden; under reduced motion it fires once and never
  // rotates.
  useEffect(() => {
    if (!featuredEnabled || usable.length < 8) return;
    const root = rootRef.current;
    if (!root) return;

    // Re-arm (new layout): drop any tile lit under the previous addressing so an
    // address from the old column count can't linger half-lit on the new wall.
    setLitTiles(new Set());

    let timer: ReturnType<typeof setTimeout> | null = null;
    const reduce =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    const pick = () => {
      const rect = root.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // Eligible zone: nearly the whole wall (thin edge strips trimmed off). Every
      // movie on the wall should eventually get its turn, so the band spans almost
      // the full width/height instead of a narrow right-of-center strip — only the
      // extreme edges (steepest foreshortening at the tilted wall's corners) and
      // the bottom dissolve are excluded. The left text block is still carved out
      // separately below via textRight/textTop.
      // NOTE: the wall is under a perspective transform, so getBoundingClientRect
      // returns an INFLATED axis-aligned box (a tilted card's AABB is far larger
      // than the card). "Whole rect inside" is therefore never satisfiable — judge
      // by the card's CENTER with margins generous enough that a center-qualified
      // card is in practice fully visible: clear of the side edges, above the
      // bottom dissolve.
      const minX = rect.left + rect.width * 0.08;
      const maxX = rect.right - rect.width * 0.08;
      const minY = rect.top + rect.height * 0.08;
      const maxY = rect.top + rect.height * 0.72;
      const textRight = rect.left + rect.width * 0.42;
      const textTop = rect.top + rect.height * 0.4;

      const tiles = Array.from(
        root.querySelectorAll<HTMLElement>("[data-tile]")
      );
      const excludeId = featuredIdRef.current;
      const history = featuredHistoryRef.current;
      const eligible: { tile: string; movieId: string }[] = [];
      const eligibleAny: { tile: string; movieId: string }[] = [];
      const eligibleUnseen: { tile: string; movieId: string }[] = [];

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
        if (movieId !== excludeId) {
          eligible.push({ tile, movieId });
          if (!history.has(movieId)) eligibleUnseen.push({ tile, movieId });
        }
      }

      // Prefer a movie not yet featured this session so the spotlight cycles
      // through the whole visible pool before repeating. Once every eligible
      // movie has had its turn (unseen empty) we reset the history — a full cycle
      // is done — and pick freely again. eligibleAny is the last resort (only the
      // current movie was in range). Randomness keeps it wandering, not marching.
      let pool = eligibleUnseen;
      if (pool.length === 0) {
        if (eligible.length > 0) history.clear();
        pool = eligible.length > 0 ? eligible : eligibleAny;
      }
      if (pool.length === 0) return;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      const { tileMovies: liveMovies, tilePairs: livePairs } =
        tileMapsRef.current;
      const movie = liveMovies.get(chosen.tile);
      if (!movie) return;
      // Light the whole poster+fanart pair for this instance, not just the tile
      // the spotlight landed on.
      setLitTiles(new Set(livePairs.get(chosen.tile) ?? [chosen.tile]));
      featuredIdRef.current = movie.id;
      featuredHistoryRef.current.add(movie.id);
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
    // pick() reads the tile→movie maps through tileMapsRef.current (refreshed
    // every render), so the effect needn't depend on the fresh Map/array — it
    // depends on the pool identity (length) plus the layout knobs that re-address
    // tiles (columnCount, style, flow). Re-arming on a layout change also resets
    // the timer cadence and clears stale lit tiles. `usable` (the array) is
    // intentionally not a dep — its identity changes every render and only its
    // length matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredEnabled, usable.length, config.columnCount, config.style, config.flow]);

  if (usable.length < 8) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="animate-mosaic-enter pointer-events-none absolute inset-0 overflow-hidden motion-reduce:animate-none"
    >
      {/* Oversized tilted plane — the -inset guarantees no empty corners after
          the perspective rotation. */}
      {/* rotateX leans the wall like a painting with its bottom edge toward
          the viewer; rotateZ turns the whole painting counterclockwise for the
          Netflix-style diagonal. The transform is chosen by config.angle — an
          inline style because Tailwind can't see the runtime MOSAIC_ANGLES value
          (the "classic" preset equals the old hardcoded transform). Vertical flow
          lays the lanes side by side (flex row); horizontal flow stacks the rows
          (flex-col) — the drift axis is transposed with the layout axis. */}
      <div
        className={`absolute -inset-[30%] flex justify-center gap-2.5 [transform-origin:center] md:gap-3 ${
          horizontal ? "flex-col" : ""
        }`}
        style={{ transform: MOSAIC_ANGLES[config.angle] }}
      >
        {lanes.map((cards, lane) =>
          horizontal ? (
            <div key={lane} className="flex min-h-0 flex-1 flex-row">
              {/* pr equals the inner gap: with two identical halves the strip
                  width becomes exactly 2×(set + gap), so translateX(-50%) lands
                  seamlessly (plain gap alone leaves a half-gap jump per loop). */}
              <div
                className="animate-mosaic-drift-x flex h-full flex-row gap-3 pr-3 [will-change:transform] motion-reduce:[animation-play-state:paused] md:gap-4 md:pr-4"
                style={{
                  "--drift-dur": `${DRIFT_DURATIONS[lane % DRIFT_DURATIONS.length]}s`,
                  animationDirection: lane % 2 === 1 ? "reverse" : "normal",
                } as React.CSSProperties}
              >
                {/* Duplicated back-to-back for a seamless translateX(-50%) loop.
                    Each instance gets its own "lane:i" address so a lit tile lights
                    only that one instance, not its loop twin. */}
                {[...cards, ...cards].map((card, i) => {
                  const tile = `${lane}:${i}`;
                  return (
                    <Card
                      key={i}
                      movie={card.movie}
                      landscape={card.landscape}
                      tile={tile}
                      lit={litTiles.has(tile)}
                      horizontal
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div key={lane} className="flex min-w-0 flex-1 flex-col gap-3 md:gap-4">
              {/* pb equals the inner gap: with two identical halves the wrapper
                  height becomes exactly 2×(set + gap), so translateY(-50%) lands
                  seamlessly (plain gap alone leaves a half-gap jump per loop). */}
              <div
                className="animate-mosaic-drift flex flex-col gap-3 pb-3 [will-change:transform] motion-reduce:[animation-play-state:paused] md:gap-4 md:pb-4"
                style={{
                  "--drift-dur": `${DRIFT_DURATIONS[lane % DRIFT_DURATIONS.length]}s`,
                  animationDirection: lane % 2 === 1 ? "reverse" : "normal",
                } as React.CSSProperties}
              >
                {/* Duplicated back-to-back for a seamless translateY(-50%) loop.
                    Each instance gets its own "lane:i" address so a lit tile lights
                    only that one instance, not its loop twin. */}
                {[...cards, ...cards].map((card, i) => {
                  const tile = `${lane}:${i}`;
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
          )
        )}
      </div>
    </div>
  );
}

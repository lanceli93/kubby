"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import { useAmbient } from "@/components/home/ambient-field";
import { extractAmbientColor } from "@/lib/ambient-color";
import {
  HeroMosaic,
  usableWallCount,
  type MosaicMovie,
} from "@/components/home/hero-mosaic";
import {
  type HeroMosaicConfig,
  DEFAULT_HERO_MOSAIC_CONFIG,
} from "@/lib/hero-mosaic-config";

// Duplicated from movie-card.tsx — the repo idiom is to inline this small helper
// at each card site rather than share it.
function getResolutionLabel(width?: number | null, height?: number | null): string | null {
  const w = width || 0;
  const h = height || 0;
  if (w >= 8000) return "8K";
  if (w >= 7000) return "7K";
  if (w >= 6000) return "6K";
  if (w >= 5000) return "5K";
  if (w >= 3500) return "4K";
  if (w >= 3000) return "3K";
  if (w >= 2500) return "2K";
  if (w >= 1920) return "FHD";
  if (w >= 1280) return "HD";
  // Sub-HD: classify by height (the "P" in 576P etc.)
  if (h >= 576) return "576P";
  if (h >= 480) return "480P";
  if (h >= 360) return "360P";
  if (h > 0 || w > 0) return "240P";
  return null;
}

function formatRuntime(totalSeconds: number): string | null {
  if (!totalSeconds || totalSeconds <= 0) return null;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

export interface HeroMovie {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  posterBlur?: string | null;
  fanartPath?: string | null;
  overview?: string | null;
  communityRating?: number | null;
  personalRating?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  progress?: number;
  discLabel?: string | null;
  currentDisc?: number;
  runtimeSeconds?: number | null;
  runtimeMinutes?: number | null;
}

interface HeroItem {
  movie: HeroMovie;
  isContinueWatching: boolean;
}

interface HomeHeroProps {
  items: HeroItem[];
  wallMovies: MosaicMovie[];
  /** True while the hero-wall pool is still loading. The single-backdrop
   *  fallback must NOT render during this window — hero items usually arrive
   *  first, and flashing one movie's fanart before the wall pops in reads as
   *  a glitch. A plain dark surface holds the space instead. */
  wallPending?: boolean;
  /** Poster-wall config (columns/style/angle). Defaults to today's classic wall. */
  mosaicConfig?: HeroMosaicConfig;
}

// Auto-advance dwell — must match the heroProgress keyframe duration in globals.css.
const ROTATE_MS = 8000;

/** Fallback single backdrop — used only when the poster wall can't render (fewer
 *  than 8 usable movies). Remounts per active slide (keyed by caller) with a
 *  plain fade-in; falls back to a flat surface color on decode error. */
function HeroBackdrop({ movie }: { movie: HeroMovie }) {
  const [imgError, setImgError] = useState(false);
  const imageSrc = movie.fanartPath || movie.posterPath;
  return (
    <div className="absolute inset-0">
      {imageSrc && !imgError ? (
        <Image
          src={resolveImageSrc(imageSrc, 1280)}
          alt={movie.title}
          fill
          priority
          sizes="100vw"
          className="animate-fade-in object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="h-full w-full bg-[var(--surface)]" />
      )}
    </div>
  );
}

export function HomeHero({
  items,
  wallMovies,
  wallPending = false,
  mosaicConfig = DEFAULT_HERO_MOSAIC_CONFIG,
}: HomeHeroProps) {
  const t = useTranslations("home");
  const router = useRouter();
  const { setBase } = useAmbient();
  const [activeIdx, setActiveIdx] = useState(0);
  const [reduced, setReduced] = useState(false);
  // Movie the poster wall has spotlit (wall mode only). The text block, buttons
  // and ambient tint all follow it once the wall reports its first pick.
  const [featured, setFeatured] = useState<MosaicMovie | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The animated poster wall replaces the backdrop when the library is rich
  // enough (≥8 usable posters/fanart for the chosen style); otherwise fall back
  // to the single-backdrop carousel. In wall mode the wall drives everything —
  // the carousel timer and slide indicators stand down.
  const wallMode = !wallPending && usableWallCount(wallMovies, mosaicConfig.style) >= 8;

  // Clamp active index if the pool shrinks (query refetch with fewer items).
  const safeIdx = activeIdx < items.length ? activeIdx : 0;
  const active = items[safeIdx];

  const handleFeature = useCallback((movie: MosaicMovie) => {
    setFeatured(movie);
  }, []);

  // Track reduced-motion preference for auto-advance + fill animation.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(reduce.matches);
    update();
    reduce.addEventListener("change", update);
    return () => reduce.removeEventListener("change", update);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Schedule the next auto-advance. Skipped in wall mode (the wall's spotlight is
  // the rhythm now), for single item, reduced motion, or while the tab is hidden;
  // visibilitychange resumes/pauses it.
  const scheduleAdvance = useCallback(() => {
    clearTimer();
    if (wallMode || items.length <= 1 || reduced) return;
    if (typeof document !== "undefined" && document.hidden) return;
    timerRef.current = setTimeout(() => {
      setActiveIdx((i) => (i + 1) % items.length);
    }, ROTATE_MS);
  }, [wallMode, items.length, reduced, clearTimer]);

  // Re-arm the timer whenever the active slide changes.
  useEffect(() => {
    scheduleAdvance();
    return clearTimer;
  }, [safeIdx, scheduleAdvance, clearTimer]);

  // Pause on tab hide, resume on show.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.hidden) clearTimer();
      else scheduleAdvance();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [scheduleAdvance, clearTimer]);

  // Resolve the movie the text block, buttons and ambient should display.
  //  - Fallback (carousel) mode: exactly the active carousel slide, as before.
  //  - Wall mode: whichever movie the wall has spotlit. We enrich it from the
  //    carousel items (continue-watching progress/disc label/current disc) when
  //    that movie is also a hero item; otherwise treat the bare wall movie as a
  //    HeroMovie. Before the wall reports its first pick, show today's default
  //    (first hero item, else the first usable wall movie) so the block isn't empty.
  const byId = new Map<
    string,
    { movie: HeroMovie; isContinueWatching: boolean }
  >();
  // Wall movies first (as HeroMovie-compatible, not continue-watching)…
  for (const m of wallMovies) {
    if (!byId.has(m.id)) {
      byId.set(m.id, { movie: m as HeroMovie, isContinueWatching: false });
    }
  }
  // …then hero items win (richer continue-watching enrichment).
  for (const it of items) {
    byId.set(it.movie.id, it);
  }

  let displayEntry: { movie: HeroMovie; isContinueWatching: boolean } | null;
  if (wallMode) {
    if (featured) {
      displayEntry =
        byId.get(featured.id) ?? {
          movie: featured as HeroMovie,
          isContinueWatching: false,
        };
    } else {
      // Nothing spotlit yet — show what would show today.
      const firstUsableWall = wallMovies.find((m) => m.posterPath || m.fanartPath);
      displayEntry =
        items[0] ??
        (firstUsableWall
          ? { movie: firstUsableWall as HeroMovie, isContinueWatching: false }
          : null);
    }
  } else {
    displayEntry = active ?? null;
  }

  // Ease the ambient base toward the displayed movie's poster tint.
  const displayBlur = displayEntry?.movie.posterBlur;
  useEffect(() => {
    if (!displayBlur) return;
    let cancelled = false;
    extractAmbientColor(displayBlur).then((rgb) => {
      if (rgb && !cancelled) setBase(rgb);
    });
    return () => {
      cancelled = true;
    };
  }, [displayBlur, setBase]);

  const jumpTo = useCallback(
    (i: number) => {
      setActiveIdx(i);
      // Reset the dwell timer immediately; the safeIdx effect also re-arms it
      // once state commits, but this covers clicking the already-active dot.
      scheduleAdvance();
    },
    [scheduleAdvance]
  );

  // Wall pool still loading and no carousel item ready either — hold the
  // hero's box with the plain dark shell so the rows below don't jump up and
  // then get pushed down when the wall arrives.
  if (!displayEntry && wallPending) {
    return (
      <div className="relative h-[52vh] min-h-[380px] w-full overflow-hidden bg-[#0a0a0f] md:h-[64vh] md:min-h-[480px]">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[55%] bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/55 to-transparent" />
      </div>
    );
  }

  if (!displayEntry) return null;

  const { movie, isContinueWatching } = displayEntry;
  const {
    id,
    title,
    overview,
    communityRating,
    personalRating,
    videoWidth,
    videoHeight,
    discLabel,
    currentDisc,
    year,
    runtimeSeconds,
    runtimeMinutes,
  } = movie;

  const displayTitle = discLabel ? `${discLabel} · ${title}` : title;
  const resolution = getResolutionLabel(videoWidth, videoHeight);
  const runtime = formatRuntime(
    runtimeSeconds || (runtimeMinutes ? runtimeMinutes * 60 : 0)
  );
  const playHref =
    currentDisc && currentDisc > 1
      ? `/movies/${id}/play?disc=${currentDisc}`
      : `/movies/${id}/play`;

  // Build the caption meta row items in poster-wall order, then interleave dots.
  const metaItems: React.ReactNode[] = [];
  if (year) metaItems.push(<span key="year">{year}</span>);
  if (resolution)
    metaItems.push(
      <span
        key="resolution"
        className="rounded border border-white/20 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wider text-white/85"
      >
        {resolution}
      </span>
    );
  if (runtime) metaItems.push(<span key="runtime">{runtime}</span>);
  if (communityRating != null && communityRating > 0)
    metaItems.push(
      <span key="communityRating" className="font-semibold text-purple-400">
        ★ {communityRating.toFixed(1)}
      </span>
    );
  if (personalRating != null && personalRating > 0)
    metaItems.push(
      <span key="personalRating" className="font-semibold text-[var(--gold)]">
        ★ {personalRating.toFixed(1)}
      </span>
    );

  return (
    <div className="group/hero relative h-[52vh] min-h-[380px] w-full overflow-hidden md:h-[64vh] md:min-h-[480px]">
      {/* Backdrop layer (z-0, non-interactive): animated poster wall that drives
          the featured movie, or a single fallback backdrop of the active slide. */}
      {wallMode ? (
        <div className="absolute inset-0 z-0">
          <HeroMosaic
            movies={wallMovies}
            onFeature={handleFeature}
            config={mosaicConfig}
          />
        </div>
      ) : wallPending ? (
        // Wall pool still loading — hold a plain dark surface. Rendering the
        // fallback fanart here would flash one movie full-bleed for an instant
        // before the wall replaces it (hero items resolve before the wall).
        <div className="pointer-events-none absolute inset-0 z-0 bg-[#0a0a0f]" />
      ) : (
        <div key={id} className="pointer-events-none absolute inset-0 z-0">
          <HeroBackdrop movie={movie} />
        </div>
      )}

      {/* Whole hero (except interactive layers) links to the active detail page.
          Sits above the pointer-events-none backdrop so clicks land here. */}
      <Link
        href={`/movies/${id}`}
        aria-label={title}
        className="absolute inset-0 z-[1]"
      />

      {/* Gradient overlays — non-interactive so the underlying Link stays clickable */}
      {/* Bottom dissolve: projection dissolves into the page */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[55%] bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/55 to-transparent" />
      {/* Left text scrim */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[65%] bg-gradient-to-r from-black/65 via-black/25 to-transparent" />
      {/* Top scrim for the transparent header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 bg-gradient-to-b from-black/60 to-transparent" />

      {/* Content row — left text block only (the wall replaced the floating poster) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[10%] z-[2] px-4 md:px-12">
        {/* Left text block — re-fades on slide change */}
        <div key={id} className="animate-fade-in max-w-xl md:max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            NOW SHOWING · {t(isContinueWatching ? "continueWatching" : "recentlyAdded")}
          </p>
          {/* Single line, ellipsis for very long titles. Explicit leading:
              text-5xl's tight default line-height clips descenders (g/y/p)
              inside truncate's overflow-hidden box. */}
          <h2 className="mt-2 truncate text-3xl font-bold leading-[1.25] tracking-wide text-white/95 [text-shadow:0_2px_24px_rgba(0,0,0,0.9)] md:text-5xl">
            {displayTitle}
          </h2>
          {overview && (
            <p className="mt-2.5 line-clamp-2 max-w-lg text-sm leading-relaxed text-white/70">
              {overview}
            </p>
          )}
          {metaItems.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-white/65">
              {metaItems.flatMap((node, i) =>
                i === 0
                  ? [node]
                  : [
                      <span key={`dot-${i}`} className="text-white/25">
                        ·
                      </span>,
                      node,
                    ]
              )}
            </div>
          )}
          {/* Actions row — pointer-events restored so the buttons are clickable */}
          <div className="pointer-events-auto mt-5 flex gap-3">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(playHref);
              }}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-black transition-fluid hover:scale-[1.03] hover:bg-white/85 active:scale-95"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,3 20,12 6,21" />
              </svg>
              {t(isContinueWatching ? "heroResume" : "heroPlay")}
            </button>
            <Link
              href={`/movies/${id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex h-11 items-center rounded-full border border-white/25 bg-white/5 px-7 text-sm font-medium text-white/90 transition-fluid hover:scale-[1.03] hover:border-white/40 hover:bg-white/15 active:scale-95"
            >
              {t("heroDetails")}
            </Link>
          </div>
        </div>
      </div>

      {/* Slide indicators — fallback (carousel) mode only. In wall mode the
          wall's 8s spotlight is the rhythm, so no indicator strip. Also hidden
          while the wall pool loads (wallPending): the carousel items resolve
          first, so the strip would flash on the dark placeholder for a beat and
          then vanish the instant the wall arrives. z-20: the content rows
          overlap the hero bottom (negative margin, z-10) — the strip must stay
          above them to stay clickable. */}
      {!wallMode && !wallPending && items.length > 1 && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
          {items.map((_, i) =>
            i === safeIdx ? (
              <button
                key={i}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  jumpTo(i);
                }}
                aria-label={`Slide ${i + 1}`}
                className="relative h-[3px] w-10 cursor-pointer overflow-hidden rounded-full bg-white/25 transition-all duration-300"
              >
                {reduced ? (
                  <span className="absolute inset-0 rounded-full bg-white/80" />
                ) : (
                  <span
                    key={safeIdx}
                    className="animate-hero-progress motion-reduce:animate-none block h-full rounded-full bg-white/90"
                  />
                )}
              </button>
            ) : (
              <button
                key={i}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  jumpTo(i);
                }}
                aria-label={`Slide ${i + 1}`}
                className="h-[3px] w-5 cursor-pointer rounded-full bg-white/25 transition-all duration-300 hover:bg-white/50"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

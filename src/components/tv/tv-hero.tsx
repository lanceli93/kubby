"use client";

import { useState, useEffect, useCallback } from "react";
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

// The /tv home hero — a thin TV-domain cousin of HomeHero. It reuses the shared
// HeroMosaic poster wall (which is domain-agnostic: it just needs MosaicMovie
// items) and, when the wall has ≥8 usable shows, spotlights one at a time with a
// text block that links into the TV domain (/tv/{id}). Below 8, a single
// fallback backdrop of the first show holds the space. No carousel / disc /
// runtime logic — shows resume at the episode level elsewhere (Next Up row).
export interface TvHeroShow {
  id: string;
  title: string;
  year?: number | null;
  overview?: string | null;
  status?: string | null;
  communityRating?: number | null;
  posterPath?: string | null;
  fanartPath?: string | null;
  posterBlur?: string | null;
}

interface TvHeroProps {
  /** Poster/fanart pool for the animated wall (from /api/tv/hero-wall). */
  wallShows: MosaicMovie[];
  /** True while the wall pool is still loading — hold a plain dark shell so the
   *  rows below don't jump when the wall pops in. */
  wallPending?: boolean;
  /** Richer metadata for the spotlight text block, keyed by show id (from the
   *  recently-added / all-shows queries the page already runs). */
  detailsById?: Map<string, TvHeroShow>;
  /** TV poster-wall config (columns/style/angle/flow). Defaults to today's
   *  classic wall so callers without a saved config are unchanged. */
  mosaicConfig?: HeroMosaicConfig;
}

export function TvHero({
  wallShows,
  wallPending = false,
  detailsById,
  mosaicConfig = DEFAULT_HERO_MOSAIC_CONFIG,
}: TvHeroProps) {
  const t = useTranslations("tv");
  const router = useRouter();
  const { setBase } = useAmbient();
  const [featured, setFeatured] = useState<MosaicMovie | null>(null);

  const wallMode =
    !wallPending && usableWallCount(wallShows, mosaicConfig.style) >= 8;

  const handleFeature = useCallback((show: MosaicMovie) => {
    setFeatured(show);
  }, []);

  // The show the text block should describe: the spotlit wall show once the
  // wall reports a pick, else the first usable show so the block isn't empty.
  const firstUsable = wallShows.find((m) => m.posterPath || m.fanartPath) ?? null;
  const display = featured ?? firstUsable;

  // Merge in richer metadata (overview/status/rating) when we have it.
  const detail = display ? detailsById?.get(display.id) : undefined;

  // Ease the ambient base toward the displayed show's poster tint.
  const displayBlur = display?.posterBlur;
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

  // Wall pool loading and nothing to show — hold the box with a dark shell.
  if (!display && wallPending) {
    return (
      <div className="relative h-[52vh] min-h-[380px] w-full overflow-hidden bg-[#0a0a0f] md:h-[calc(100vh-340px)] md:min-h-[480px]">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[55%] bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/55 to-transparent" />
      </div>
    );
  }
  if (!display) return null;

  const id = display.id;
  const title = display.title;
  const year = detail?.year;
  const overview = detail?.overview;
  const status = detail?.status;
  const communityRating = detail?.communityRating;
  const backdrop = display.fanartPath || display.posterPath;

  const metaItems: React.ReactNode[] = [];
  if (year) metaItems.push(<span key="year">{year}</span>);
  if (status)
    metaItems.push(
      <span key="status">
        {status === "Continuing"
          ? t("showStatus.continuing")
          : status === "Ended"
          ? t("showStatus.ended")
          : status}
      </span>
    );
  if (communityRating != null && communityRating > 0)
    metaItems.push(
      <span key="rating" className="font-semibold text-purple-400">
        ★ {communityRating.toFixed(1)}
      </span>
    );

  return (
    <div className="group/hero relative h-[52vh] min-h-[380px] w-full overflow-hidden md:h-[calc(100vh-340px)] md:min-h-[480px]">
      {/* Backdrop layer (z-0, non-interactive) */}
      {wallMode ? (
        <div className="absolute inset-0 z-0">
          <HeroMosaic
            movies={wallShows}
            onFeature={handleFeature}
            config={mosaicConfig}
          />
        </div>
      ) : backdrop ? (
        <div key={id} className="pointer-events-none absolute inset-0 z-0">
          <Image
            src={resolveImageSrc(backdrop, 1280)}
            alt={title}
            fill
            priority
            sizes="100vw"
            className="animate-fade-in object-cover"
          />
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 z-0 bg-[var(--surface)]" />
      )}

      {/* Whole hero links to the featured show's detail page. */}
      <Link href={`/tv/${id}`} aria-label={title} className="absolute inset-0 z-[1]" />

      {/* Gradient overlays — non-interactive */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[55%] bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/55 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[65%] bg-gradient-to-r from-black/65 via-black/25 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 bg-gradient-to-b from-black/60 to-transparent" />

      {/* Left text block */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[10%] z-[2] px-4 md:px-12">
        <div key={id} className="animate-fade-in max-w-xl md:max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
            {t("title")}
          </p>
          <h2 className="mt-2 truncate text-3xl font-bold leading-[1.25] tracking-wide text-white/95 [text-shadow:0_2px_24px_rgba(0,0,0,0.9)] md:text-5xl">
            {title}
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
          <div className="pointer-events-auto mt-5 flex gap-3">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/tv/${id}`);
              }}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-black transition-fluid hover:scale-[1.03] hover:bg-white/85 active:scale-95"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,3 20,12 6,21" />
              </svg>
              {t("playEpisode")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

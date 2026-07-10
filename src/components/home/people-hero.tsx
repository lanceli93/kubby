"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAmbient } from "@/components/home/ambient-field";
import { extractAmbientColor } from "@/lib/ambient-color";
import {
  HeroMosaic,
  usableWallCount,
  type MosaicMovie,
} from "@/components/home/hero-mosaic";
import type { HeroMosaicConfig } from "@/lib/hero-mosaic-config";
import type { PeopleMosaicConfig } from "@/lib/people-mosaic-config";

// One flat entry from GET /api/people/hero-wall. A person yields a photo entry
// (id === personId, may carry the person's own fanart) plus optional gallery
// entries (suffixed id `<personId>:gN`, fanartPath null). `personId` is what
// navigation uses — the id is a per-tile address, not routable on its own.
export interface PeopleWallEntry {
  id: string;
  personId: string;
  name: string;
  type: string;
  posterPath?: string | null;
  fanartPath?: string | null;
  posterBlur?: string | null;
  // True width/height ratios so the mosaic sizes each tile to its image (avoids
  // cropping arbitrary-ratio fanart / gallery photos). Spread onto MosaicMovie
  // via `...e` below.
  posterAspect?: number | null;
  fanartAspect?: number | null;
  birthYear?: number | null;
  movieCount?: number | null;
  personalRating?: number | null;
  isFavorite?: boolean;
}

// Person type → peopleHero i18n key for the NOW SHOWING eyebrow. Unknown types
// fall back to the generic actor label.
const TYPE_KEYS: Record<string, string> = {
  actor: "typeActor",
  director: "typeDirector",
  writer: "typeWriter",
  producer: "typeProducer",
};

interface PeopleHeroProps {
  entries: PeopleWallEntry[];
  /** True while the people hero-wall pool is still loading. */
  pending: boolean;
  config: PeopleMosaicConfig;
}

/** Full-height People tab wall — a taller HomeHero with no carousel fallback and
 *  no play button. The animated HeroMosaic drives the spotlight; the caption,
 *  ambient tint and both links follow whichever person the wall lights. Owns the
 *  whole viewport area (this tab has no content rows below the wall). */
export function PeopleHero({ entries, pending, config }: PeopleHeroProps) {
  const tPH = useTranslations("peopleHero");
  // Reuse the movie hero's "Details" label — the peopleHero namespace has no
  // action-button key, and the pill mirrors HomeHero's Details Link exactly.
  const t = useTranslations("home");
  const { setBase } = useAmbient();
  // Person the wall has spotlit. The caption, buttons and ambient tint all
  // follow it once the wall reports its first pick (mirrors HomeHero).
  const [featured, setFeatured] = useState<PeopleWallEntry | null>(null);

  // Map entries to MosaicMovie: HeroMosaic needs `{ id, title, ... }`, so alias
  // name → title. Every extra field (personId, type, meta) rides along on the
  // object and is recovered by casting the reported MosaicMovie back below.
  const mapped: MosaicMovie[] = entries.map((e) => ({
    ...e,
    title: e.name,
  }));

  // "both" style pairs a photo entry with its OWN fanart tile (HeroMosaic pairs
  // poster+fanart of the same id); gallery entries (fanartPath null) render as
  // single tiles. The people wall has no libraries/year/resolution knobs.
  const mosaicConfig: HeroMosaicConfig = {
    columnCount: config.columnCount,
    style: "both",
    angle: config.angle,
    flow: config.flow,
    libraryWeights: {},
    yearFrom: null,
    yearTo: null,
    minWidth: null,
  };

  const handleFeature = useCallback((movie: MosaicMovie) => {
    // The wall reports a bare MosaicMovie, but the entry's extra fields (personId,
    // type, meta) rode along on the same object — recover them via unknown (the
    // mapped object IS the original entry, so this is safe at runtime).
    setFeatured(movie as unknown as PeopleWallEntry);
  }, []);

  // The person the caption/ambient should display: whichever the wall spotlit,
  // else the first entry with a photo so the caption isn't empty before the
  // wall reports its first pick.
  const displayEntry =
    featured ?? entries.find((e) => e.posterPath) ?? null;

  // Ease the ambient base toward the displayed person's photo tint.
  const displayBlur = displayEntry?.posterBlur;
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

  // Wall pool still loading — hold the plain dark shell so the tab doesn't flash
  // (same surface + bottom dissolve as HomeHero's pending branch, but full height).
  if (pending) {
    return (
      <div className="relative h-full min-h-[480px] w-full overflow-hidden bg-[#0a0a0f]">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[55%] bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/55 to-transparent" />
      </div>
    );
  }

  // Below 8 usable entries the wall won't render (usableWallCount mirrors the
  // wall's own predicate for "both"), so show a centered empty-state prompt.
  if (usableWallCount(mapped, "both") < 8) {
    return (
      <div className="relative flex h-full min-h-[480px] w-full items-center justify-center overflow-hidden bg-[#0a0a0f] px-8 text-center">
        <p className="max-w-md text-sm text-white/50">{tPH("notEnough")}</p>
      </div>
    );
  }

  const featuredId = displayEntry?.personId;

  // Build the caption meta row items, then interleave dots (same pattern as
  // HomeHero). birthYear · N movies · ★ personal rating · ♥ favorite.
  const metaItems: React.ReactNode[] = [];
  if (displayEntry?.birthYear)
    metaItems.push(<span key="birthYear">{displayEntry.birthYear}</span>);
  if (displayEntry?.movieCount != null && displayEntry.movieCount > 0)
    metaItems.push(
      <span key="movieCount">
        {tPH("moviesCount", { count: displayEntry.movieCount })}
      </span>
    );
  if (displayEntry?.personalRating != null && displayEntry.personalRating > 0)
    metaItems.push(
      <span key="personalRating" className="font-semibold text-[var(--gold)]">
        ★ {displayEntry.personalRating.toFixed(1)}
      </span>
    );
  if (displayEntry?.isFavorite)
    metaItems.push(
      <span key="favorite" className="text-red-400">
        ♥
      </span>
    );

  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden">
      {/* Backdrop layer (z-0, non-interactive): the animated people poster wall
          that drives the featured person. */}
      <div className="absolute inset-0 z-0">
        <HeroMosaic
          movies={mapped}
          onFeature={handleFeature}
          config={mosaicConfig}
        />
      </div>

      {/* Whole hero links to the featured person. Sits above the
          pointer-events-none backdrop so clicks land here. */}
      {featuredId && (
        <Link
          href={`/people/${featuredId}`}
          aria-label={displayEntry?.name}
          className="absolute inset-0 z-[1]"
        />
      )}

      {/* Gradient overlays — non-interactive so the underlying Link stays clickable */}
      {/* Bottom dissolve: the wall dissolves into the page */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[55%] bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/55 to-transparent" />
      {/* Left text scrim */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[65%] bg-gradient-to-r from-black/65 via-black/25 to-transparent" />
      {/* Top scrim for the transparent header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 bg-gradient-to-b from-black/60 to-transparent" />

      {/* Content row — left text block only (bottom-left). */}
      {displayEntry && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[10%] z-[2] px-4 md:px-12">
          {/* Re-fades on spotlight change (keyed by the featured person id). */}
          <div key={featuredId} className="animate-fade-in max-w-xl md:max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
              NOW SHOWING · {tPH(TYPE_KEYS[displayEntry.type] ?? "typeActor")}
            </p>
            {/* Single line, ellipsis for very long names. Explicit leading:
                text-5xl's tight default line-height clips descenders (g/y/p)
                inside truncate's overflow-hidden box. */}
            <h2 className="mt-2 truncate text-3xl font-bold leading-[1.25] tracking-wide text-white/95 [text-shadow:0_2px_24px_rgba(0,0,0,0.9)] md:text-5xl">
              {displayEntry.name}
            </h2>
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
            {/* Actions row — single Details pill (no play button for people). */}
            {featuredId && (
              <div className="pointer-events-auto mt-5 flex gap-3">
                <Link
                  href={`/people/${featuredId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-11 items-center rounded-full border border-white/25 bg-white/5 px-7 text-sm font-medium text-white/90 transition-fluid hover:scale-[1.03] hover:border-white/40 hover:bg-white/15 active:scale-95"
                >
                  {t("heroDetails")}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

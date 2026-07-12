"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Tv, Star } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { startPosterViewTransition, startDimNavigation } from "@/lib/view-transition";
import { useTranslations } from "next-intl";
import { TiltCard } from "@/components/ui/tilt-card";
import { useUserPreferences } from "@/hooks/use-user-preferences";

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

interface ShowCardProps {
  id: string;
  title: string;
  year?: number | null;
  posterPath?: string | null;
  posterBlur?: string | null;
  /** Personal rating (0–10). When set + the pref is on, shows a gold star badge
   *  top-right (mirrors the movie card). TV shows have no community fallback. */
  personalRating?: number | null;
  /** Resolution hint — TV shows are multi-episode so there's usually no single
   *  resolution; the badge renders only when a caller supplies these. */
  videoWidth?: number | null;
  videoHeight?: number | null;
  /** Shown as a subtitle below the year (e.g. episode count). */
  subtitle?: string;
  responsive?: boolean;
  /** LCP hint — pass for the first ~10 above-the-fold cards so the poster
   *  loads eagerly with fetchpriority=high instead of lazy. */
  priority?: boolean;
  /** Use the dip-through-dark navigation instead of the poster morph. Set on
   *  the detail page's "You May Also Like" row: a full darken would hide a
   *  flying poster, so detail→detail dips to black and rises into the new page
   *  instead. See `startDimNavigation` in lib/view-transition.ts. */
  dimTransition?: boolean;
}

/** A thin poster card for a TV show — mirrors the movie/album card shape but
 *  links to `/tv/${id}` and carries no movie-specific menus. */
export function ShowCard({
  id,
  title,
  year,
  posterPath,
  posterBlur,
  personalRating,
  videoWidth,
  videoHeight,
  subtitle,
  responsive,
  priority,
  dimTransition,
}: ShowCardProps) {
  const router = useRouter();
  const posterRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("tv");
  const [imgError, setImgError] = useState(false);
  const { data: prefs } = useUserPreferences();
  const showRatingBadge = prefs?.showTvShowRatingBadge !== false;
  const showResBadge = prefs?.showTvResolutionBadge !== false;

  return (
    <div
      className={`group flex-shrink-0 transition-[scale] duration-200 ease-out hover:scale-[1.03] ${responsive ? "w-full" : ""}`}
      style={responsive ? undefined : { width: 180 }}
    >
      <Link
        href={`/tv/${id}`}
        className="focus-ring block rounded-md"
        onClick={(e) => {
          // Poster morph into the detail page (shared-element View Transition).
          // Play button / dropdown items already preventDefault+stopPropagation,
          // so this only fires for a plain poster/title click. Let modified clicks
          // (new tab, etc.) fall through to Link's default behaviour.
          if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          if (dimTransition) {
            startDimNavigation(`/tv/${id}`, posterRef.current, (href) => router.push(href));
          } else {
            startPosterViewTransition(`/tv/${id}`, posterRef.current, (href) => router.push(href));
          }
        }}
      >
        {/* Poster shell — NOT overflow-hidden so tilt + ambient glow can bleed. */}
        <div className={`relative w-full ${responsive ? "aspect-[2/3]" : ""}`} style={responsive ? undefined : { height: 270 }}>
          {/* Ambient glow (ambilight) — blurred poster bleeding behind, hover-only */}
          {posterBlur && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-md bg-cover bg-center opacity-0 blur-[24px] saturate-150 transition-fluid group-hover:opacity-55"
              style={{ backgroundImage: `url(${posterBlur})` }}
            />
          )}

          <TiltCard className="h-full w-full">
            <div ref={posterRef} className="relative h-full w-full overflow-hidden rounded-md bg-[var(--surface)] ring-1 ring-white/[0.06]">
              {posterPath && !imgError ? (
                <Image
                  src={resolveImageSrc(posterPath, 360)}
                  alt={title}
                  fill
                  className="object-cover transition-fluid"
                  sizes="180px"
                  priority={priority}
                  onError={() => setImgError(true)}
                  {...(posterBlur ? { placeholder: "blur" as const, blurDataURL: posterBlur } : {})}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                  <Tv className="h-8 w-8" />
                </div>
              )}

              {/* Resolution badge — top-left, lifts on tilt. Only when a caller
                  supplies dimensions (TV shows usually have none). */}
              {showResBadge && (() => {
                const res = getResolutionLabel(videoWidth, videoHeight);
                return res ? (
                  <div className="tilt-lift absolute left-1.5 top-1.5 z-[4] rounded-sm bg-white/30 backdrop-blur-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/80 shadow-sm" style={{ "--tilt-lift": "22px" } as React.CSSProperties}>
                    {res}
                  </div>
                ) : null;
              })()}

              {/* Personal rating badge — top-right, lifts on tilt. No community
                  fallback for shows. */}
              {showRatingBadge && personalRating != null && personalRating > 0 && (
                <div className="tilt-lift absolute right-1.5 top-1.5 z-[4] flex items-center gap-0.5 glass-badge rounded-full px-1.5 py-0.5" style={{ "--tilt-lift": "22px" } as React.CSSProperties}>
                  <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
                  <span className="text-[11px] font-medium text-[var(--gold)]">
                    {personalRating.toFixed(1)}
                  </span>
                </div>
              )}

              {/* Centered play indicator on hover — floats highest on tilt */}
              <div
                className="tilt-lift pointer-events-none absolute inset-0 z-[5] flex items-center justify-center transition-fluid scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100"
                style={{ "--tilt-lift": "40px" } as React.CSSProperties}
              >
                <div
                  aria-label={t("playEpisode")}
                  className="glass-btn flex h-12 w-12 items-center justify-center rounded-full text-white/90"
                >
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                </div>
              </div>
            </div>
          </TiltCard>
        </div>

        {/* Title & year below poster */}
        <div className="mt-1.5 px-0.5 text-center">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {year && <p className="text-xs text-muted-foreground">{year}</p>}
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground/70">{subtitle}</p>
          )}
        </div>
      </Link>
    </div>
  );
}

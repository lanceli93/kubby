"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Tv } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import { TiltCard } from "@/components/ui/tilt-card";

interface ShowCardProps {
  id: string;
  title: string;
  year?: number | null;
  posterPath?: string | null;
  posterBlur?: string | null;
  /** Shown as a subtitle below the year (e.g. episode count). */
  subtitle?: string;
  responsive?: boolean;
  /** LCP hint — pass for the first ~10 above-the-fold cards so the poster
   *  loads eagerly with fetchpriority=high instead of lazy. */
  priority?: boolean;
}

/** A thin poster card for a TV show — mirrors the movie/album card shape but
 *  links to `/tv/${id}` and carries no movie-specific menus. */
export function ShowCard({
  id,
  title,
  year,
  posterPath,
  posterBlur,
  subtitle,
  responsive,
  priority,
}: ShowCardProps) {
  const t = useTranslations("tv");
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`group flex-shrink-0 transition-[scale] duration-200 ease-out hover:scale-[1.03] ${responsive ? "w-full" : ""}`}
      style={responsive ? undefined : { width: 180 }}
    >
      <Link href={`/tv/${id}`} className="focus-ring block rounded-md">
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
            <div className="relative h-full w-full overflow-hidden rounded-md bg-[var(--surface)] ring-1 ring-white/[0.06]">
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

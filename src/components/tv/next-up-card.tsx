"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Tv } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import { TiltCard } from "@/components/ui/tilt-card";

interface NextUpCardProps {
  showTitle: string;
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeTitle?: string | null;
  /** Episode still; falls back to the show poster, then a placeholder. */
  stillPath?: string | null;
  stillBlur?: string | null;
  showPosterPath?: string | null;
  /** 0–100 resume progress. */
  progress?: number;
}

/** A landscape "continue watching" card — episode still, show/episode label,
 *  and a resume progress bar. Clicking jumps straight into the player. */
export function NextUpCard({
  showTitle,
  episodeId,
  seasonNumber,
  episodeNumber,
  episodeTitle,
  stillPath,
  stillBlur,
  showPosterPath,
  progress,
}: NextUpCardProps) {
  const t = useTranslations("tv");
  const [imgError, setImgError] = useState(false);
  const image = !imgError ? (stillPath ?? showPosterPath) : showPosterPath;

  return (
    <div className="group flex-shrink-0 transition-[scale] duration-200 ease-out hover:scale-[1.03]" style={{ width: 300 }}>
      <Link href={`/tv/episodes/${episodeId}/play`} className="focus-ring block rounded-md">
        {/* Still shell — 16:9 landscape. NOT overflow-hidden so tilt + glow bleed. */}
        <div className="relative w-full aspect-video">
          {stillBlur && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-md bg-cover bg-center opacity-0 blur-[24px] saturate-150 transition-fluid group-hover:opacity-55"
              style={{ backgroundImage: `url(${stillBlur})` }}
            />
          )}

          <TiltCard className="h-full w-full">
            <div className="relative h-full w-full overflow-hidden rounded-md bg-[var(--surface)] ring-1 ring-white/[0.06]">
              {image ? (
                <Image
                  src={resolveImageSrc(image, 480)}
                  alt={episodeTitle || showTitle}
                  fill
                  className="object-cover transition-fluid"
                  sizes="300px"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Tv className="h-8 w-8" />
                </div>
              )}

              {/* Centered play button on hover — floats highest on tilt */}
              <div
                className="tilt-lift pointer-events-none absolute inset-0 z-[5] flex items-center justify-center transition-fluid scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100"
                style={{ "--tilt-lift": "40px" } as React.CSSProperties}
              >
                <div
                  aria-label={t("resumeEpisode")}
                  className="glass-btn flex h-12 w-12 items-center justify-center rounded-full text-white/90"
                >
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                </div>
              </div>

              {/* Resume progress bar — bottom of the still */}
              {progress != null && progress > 0 && (
                <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-white/20 z-[9]">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.max(progress, 2)}%` }}
                  />
                </div>
              )}
            </div>
          </TiltCard>
        </div>

        {/* Show title + episode label below still */}
        <div className="mt-1.5 px-0.5">
          <p className="truncate text-sm font-medium text-foreground">{showTitle}</p>
          <p className="truncate text-xs text-muted-foreground">
            S{seasonNumber}E{episodeNumber}
            {episodeTitle ? ` · ${episodeTitle}` : ""}
          </p>
        </div>
      </Link>
    </div>
  );
}

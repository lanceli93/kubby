"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import { TiltCard } from "@/components/ui/tilt-card";

interface ContinueWatchingCardProps {
  id: string;
  title: string;
  year?: number;
  fanartPath?: string | null;
  posterPath?: string | null;
  posterBlur?: string | null;
  progress?: number;
  discLabel?: string | null;
  currentDisc?: number;
}

export function ContinueWatchingCard({
  id,
  title,
  year,
  fanartPath,
  posterPath,
  posterBlur,
  progress,
  discLabel,
  currentDisc,
}: ContinueWatchingCardProps) {
  const router = useRouter();
  const t = useTranslations("movies");
  const [imgError, setImgError] = useState(false);
  const imageSrc = fanartPath || posterPath;
  const displayTitle = discLabel ? `${discLabel} · ${title}` : title;
  const playHref = currentDisc && currentDisc > 1
    ? `/movies/${id}/play?disc=${currentDisc}`
    : `/movies/${id}/play`;

  return (
    <div className="group flex-shrink-0 transition-[scale] duration-200 ease-out hover:scale-[1.02]" style={{ width: 320 }}>
      <Link href={`/movies/${id}`}>
        {/* Landscape card shell — 16:9, NOT overflow-hidden so tilt can bleed.
            The tilting subtree (image + title overlay + play button + progress
            bar) is wrapped in TiltCard so it all tilts as one object. */}
        <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
          {/* Ambient glow (ambilight) — blurred poster bleeding behind, hover-only.
              Mirrors movie-card.tsx. */}
          {posterBlur && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-md bg-cover bg-center opacity-0 blur-[24px] saturate-150 transition-fluid group-hover:opacity-55"
              style={{ backgroundImage: `url(${posterBlur})` }}
            />
          )}
          <TiltCard className="h-full w-full">
            <div className="relative h-full w-full overflow-hidden rounded-md bg-[var(--surface)] ring-1 ring-white/[0.06]">
              {imageSrc && !imgError ? (
                <Image
                  src={resolveImageSrc(imageSrc, 640)}
                  alt={title}
                  fill
                  className="object-cover transition-fluid"
                  sizes="320px"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  No Image
                </div>
              )}

              {/* Bottom gradient for text readability */}
              <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

              {/* Title + year overlay — lifts on tilt */}
              <div className="tilt-lift absolute inset-x-0 bottom-0 z-[2] px-3 pb-2.5" style={{ "--tilt-lift": "18px" } as React.CSSProperties}>
                <p className="truncate text-sm font-semibold text-white drop-shadow-md">
                  {displayTitle}
                </p>
                {year && (
                  <p className="text-xs text-white/60">{year}</p>
                )}
              </div>

              {/* Centered play button on hover — floats highest on tilt */}
              <div className="tilt-lift absolute inset-0 z-[3] flex items-center justify-center scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-fluid" style={{ "--tilt-lift": "40px" } as React.CSSProperties}>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(playHref);
                  }}
                  aria-label={t("play")}
                  className="glass-btn flex h-12 w-12 items-center justify-center rounded-full text-white/90 transition-fluid hover:scale-120 active:scale-95"
                >
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
                </button>
              </div>

              {/* Progress bar — bottom of the card, tilts with it */}
              {progress != null && progress > 0 && (
                <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-white/20 z-10">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.max(progress, 2)}%` }}
                  />
                </div>
              )}
            </div>
          </TiltCard>
        </div>
      </Link>
    </div>
  );
}

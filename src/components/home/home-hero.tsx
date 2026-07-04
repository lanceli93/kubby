"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";

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
  fanartPath?: string | null;
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

interface HomeHeroProps {
  movie: HeroMovie;
  isContinueWatching: boolean;
}

export function HomeHero({ movie, isContinueWatching }: HomeHeroProps) {
  const t = useTranslations("home");
  const router = useRouter();
  const [imgError, setImgError] = useState(false);

  const {
    id,
    title,
    year,
    posterPath,
    fanartPath,
    communityRating,
    personalRating,
    videoWidth,
    videoHeight,
    progress,
    discLabel,
    currentDisc,
    runtimeSeconds,
    runtimeMinutes,
  } = movie;

  const imageSrc = fanartPath || posterPath;
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
    <div className="relative h-[46vh] min-h-[340px] w-full overflow-hidden md:h-[58vh] md:min-h-[440px]">
      {/* Whole hero (except buttons) links to the detail page */}
      <Link href={`/movies/${id}`} className="absolute inset-0 z-0">
        {imageSrc && !imgError ? (
          <Image
            src={resolveImageSrc(imageSrc, 1280)}
            alt={title}
            fill
            priority
            sizes="100vw"
            className="animate-ken-burns motion-reduce:animate-none object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="h-full w-full bg-[var(--surface)]" />
        )}
      </Link>

      {/* Gradient overlays — non-interactive so the underlying Link stays clickable */}
      {/* Bottom dissolve: projection dissolves into the page */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[55%] bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/55 to-transparent" />
      {/* Left text scrim */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[65%] bg-gradient-to-r from-black/65 via-black/25 to-transparent" />
      {/* Top scrim for the transparent header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 bg-gradient-to-b from-black/60 to-transparent" />

      {/* Content block */}
      <div className="animate-fade-in pointer-events-none absolute bottom-[14%] left-0 z-[2] max-w-3xl px-4 md:px-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
          NOW SHOWING · {t(isContinueWatching ? "continueWatching" : "recentlyAdded")}
        </p>
        <h2 className="mt-2 line-clamp-2 text-3xl font-bold tracking-wide text-white/95 [text-shadow:0_2px_24px_rgba(0,0,0,0.9)] md:text-5xl">
          {displayTitle}
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
        {/* Actions row — pointer-events restored so the buttons are clickable */}
        <div className="pointer-events-auto mt-5 flex gap-3">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(playHref);
            }}
            className="relative flex h-11 cursor-pointer items-center gap-2 overflow-hidden rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-fluid hover:scale-[1.03] hover:bg-primary/90 active:scale-95"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,3 20,12 6,21" />
            </svg>
            {t(isContinueWatching ? "heroResume" : "heroPlay")}
            {progress != null && progress > 0 && (
              <span className="absolute inset-x-4 bottom-1.5 h-[2px] rounded-full bg-white/25">
                <span
                  className="block h-full rounded-full bg-white"
                  style={{ width: `${Math.max(progress, 2)}%` }}
                />
              </span>
            )}
          </button>
          <Link
            href={`/movies/${id}`}
            onClick={(e) => e.stopPropagation()}
            className="glass-btn flex h-11 items-center rounded-full px-6 text-sm font-medium text-white/90 transition-fluid hover:scale-[1.03] active:scale-95"
          >
            {t("heroDetails")}
          </Link>
        </div>
      </div>
    </div>
  );
}

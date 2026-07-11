"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { UserRound } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";

interface ArtistCardProps {
  id: string;
  name: string;
  imagePath?: string | null;
  imageBlur?: string | null;
  albumCount?: number;
  responsive?: boolean;
  /** LCP hint — pass for the first ~10 above-the-fold cards so the image
   *  loads eagerly with fetchpriority=high instead of lazy. */
  priority?: boolean;
}

export function ArtistCard({
  id,
  name,
  imagePath,
  imageBlur,
  albumCount = 0,
  responsive,
  priority,
}: ArtistCardProps) {
  const t = useTranslations("music");
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`group flex-shrink-0 transition-[scale] duration-200 ease-out hover:scale-[1.03] ${responsive ? "w-full" : ""}`}
      style={responsive ? undefined : { width: 180 }}
    >
      <Link href={`/music/artists/${id}`} className="focus-ring block rounded-md">

        {/* Round image shell — a gentle hover scale is enough for a round card,
            so no TiltCard, but keep the same ambient-glow (ambilight) bleed. */}
        <div className="relative aspect-square w-full">
          {/* Ambient glow (ambilight) — blurred image bleeding behind, hover-only */}
          {imageBlur && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-full bg-cover bg-center opacity-0 blur-[24px] saturate-150 transition-fluid group-hover:opacity-55"
              style={{ backgroundImage: `url(${imageBlur})` }}
            />
          )}

          <div className="relative h-full w-full overflow-hidden rounded-full bg-[var(--surface)] ring-1 ring-white/[0.06]">
            {imagePath && !imgError ? (
              <Image
                src={resolveImageSrc(imagePath, 360)}
                alt={name}
                fill
                className="object-cover transition-fluid"
                sizes="180px"
                priority={priority}
                onError={() => setImgError(true)}
                {...(imageBlur ? { placeholder: "blur" as const, blurDataURL: imageBlur } : {})}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <UserRound className="h-10 w-10" />
              </div>
            )}
          </div>
        </div>

        {/* Name & album count below image */}
        <div className="mt-1.5 px-0.5 text-center">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground">{t("albumCount", { count: albumCount })}</p>
        </div>
      </Link>
    </div>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { resolveImageSrc } from "@/lib/image-utils";
import { getTier, getTierColor, getTierBorderColor, getTierGlow } from "@/lib/tier";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useTranslations } from "next-intl";

interface PersonCardProps {
  id: string;
  name: string;
  role?: string;
  photoPath?: string | null;
  personalRating?: number | null;
  age?: number | null;
  size?: "sm" | "md" | "lg" | "movie";
}

const sizeConfig = {
  sm: { width: 140, height: 210 },
  md: { width: 160, height: 240 },
  lg: { width: 240, height: 340 },
  movie: { width: 180, height: 270 },
};

export function PersonCard({
  id,
  name,
  role,
  photoPath,
  personalRating,
  age,
  size = "sm",
}: PersonCardProps) {
  const { width, height } = sizeConfig[size];
  const t = useTranslations("person");
  const { data: prefs } = useUserPreferences();
  const showTierBadge = prefs?.showPersonTierBadge !== false;

  return (
    <Link
      href={`/people/${id}`}
      className="group flex-shrink-0 transition-transform hover:scale-[1.03]"
      style={{ width }}
    >
      {/* Photo */}
      <div
        className="relative overflow-hidden rounded-[4px] bg-[var(--surface)]"
        style={{ width, height }}
      >
        {photoPath ? (
          <Image
            src={resolveImageSrc(photoPath)}
            alt={name}
            fill
            className="object-cover"
            sizes={`${width}px`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-3xl">
            {name[0]?.toUpperCase()}
          </div>
        )}

        {/* Tier badge */}
        {showTierBadge && personalRating != null && personalRating > 0 && (() => {
          const tier = getTier(personalRating);
          return (
            <div className={`absolute right-1.5 top-1.5 rounded border bg-black/60 px-1.5 py-0.5 text-[11px] font-black tracking-wider ${getTierColor(tier)} ${getTierBorderColor(tier)} ${getTierGlow(tier)}`}>
              {tier}
            </div>
          );
        })()}
      </div>

      {/* Name & role below poster */}
      <div className="mt-1.5 px-0.5 text-center">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {role && (
          <p className="truncate text-xs text-muted-foreground">{role}</p>
        )}
        {age != null && (
          <p className="truncate text-xs text-muted-foreground/70">{t("filmedAtAge", { age })}</p>
        )}
      </div>
    </Link>
  );
}

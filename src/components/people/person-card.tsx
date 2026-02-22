"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, MoreHorizontal, ImageIcon, Pencil } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { getTier, getTierColor, getTierBorderColor, getTierGlow } from "@/lib/tier";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ImageEditorDialog } from "@/components/shared/image-editor-dialog";
import { PersonMetadataEditor } from "@/components/people/person-metadata-editor";

interface PersonCardProps {
  id: string;
  name: string;
  role?: string;
  photoPath?: string | null;
  photoBlur?: string | null;
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
  photoBlur,
  personalRating,
  age,
  size = "sm",
}: PersonCardProps) {
  const { width, height } = sizeConfig[size];
  const t = useTranslations("person");
  const tMeta = useTranslations("metadata");
  const { data: prefs } = useUserPreferences();
  const showTierBadge = prefs?.showPersonTierBadge !== false;
  const showRatingBadge = prefs?.showPersonRatingBadge !== false;
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);

  return (
    <div className="group flex-shrink-0 transition-transform hover:scale-[1.03]" style={{ width }}>
    <Link
      href={`/people/${id}`}
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
            {...(photoBlur ? { placeholder: "blur" as const, blurDataURL: photoBlur } : {})}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-3xl">
            {name[0]?.toUpperCase()}
          </div>
        )}

        {/* Tier badge — top-left */}
        {showTierBadge && personalRating != null && personalRating > 0 && (() => {
          const tier = getTier(personalRating);
          return (
            <div className={`absolute left-1.5 top-1.5 rounded border bg-black/60 px-1.5 py-0.5 text-[11px] font-black tracking-wider ${getTierColor(tier)} ${getTierBorderColor(tier)} ${getTierGlow(tier)}`}>
              {tier}
            </div>
          );
        })()}

        {/* Personal rating badge — top-right */}
        {showRatingBadge && personalRating != null && personalRating > 0 && (
          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5">
            <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
            <span className="text-[11px] font-medium text-[var(--gold)]">
              {personalRating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Hover overlay bar with dropdown */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-[5]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/20"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 border-white/10 bg-black/70 backdrop-blur-xl"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setMetadataOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                {tMeta("editMetadata")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setImageEditorOpen(true);
                }}
              >
                <ImageIcon className="h-4 w-4" />
                {tMeta("editImages")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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

      {/* Dialogs rendered lazily — only mount when opened to minimize DOM overhead */}
      {metadataOpen && (
        <PersonMetadataEditor
          personId={id}
          open={metadataOpen}
          onOpenChange={setMetadataOpen}
        />
      )}
      {imageEditorOpen && (
        <ImageEditorDialog
          open={imageEditorOpen}
          onOpenChange={setImageEditorOpen}
          entityType="person"
          entityId={id}
          entityName={name}
        />
      )}
    </div>
  );
}

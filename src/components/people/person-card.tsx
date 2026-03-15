"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, MoreHorizontal, ImageIcon, Pencil, Trash2 } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { getTier, getTierColor, getTierBorderColor, getTierGlow } from "@/lib/tier";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  onDelete?: (deleteFiles: boolean) => void;
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
  onDelete,
}: PersonCardProps) {
  const { width, height } = sizeConfig[size];
  const t = useTranslations("person");
  const tMeta = useTranslations("metadata");
  const tCommon = useTranslations("common");
  const { data: prefs } = useUserPreferences();
  const showTierBadge = prefs?.showPersonTierBadge !== false;
  const showRatingBadge = prefs?.showPersonRatingBadge !== false;
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);

  return (
    <div className="group flex-shrink-0 hover:scale-[1.03] transition-[scale] duration-200 ease-out" style={{ width }}>
    <Link
      href={`/people/${id}`}
    >
      {/* Photo */}
      <div
        className="relative overflow-hidden rounded-lg bg-[var(--surface)] ring-1 ring-white/[0.06]"
        style={{ width, height }}
      >
        {photoPath ? (
          <Image
            src={resolveImageSrc(photoPath, width * 2)}
            alt={name}
            fill
            className="object-cover transition-fluid group-hover:scale-105"
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
            <div className={`absolute left-1.5 top-1.5 glass-badge rounded-md px-1.5 py-0.5 text-[11px] font-black tracking-wider ${getTierColor(tier)} ${getTierGlow(tier)}`}>
              {tier}
            </div>
          );
        })()}

        {/* Personal rating badge — top-right */}
        {showRatingBadge && personalRating != null && personalRating > 0 && (
          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 glass-badge rounded-full px-1.5 py-0.5">
            <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
            <span className="text-[11px] font-medium text-[var(--gold)]">
              {personalRating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Hover overlay bar — glass, slides up */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-end px-2 py-1.5 backdrop-blur-md bg-black/30 border-t border-white/10 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-[translate,opacity] duration-200 ease-out z-[5]">
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
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("deletePerson")}
                  </DropdownMenuItem>
                </>
              )}
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
      {deleteOpen && (
        <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteFiles(false); }}>
          <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>{t("deletePerson")}</DialogTitle>
              <DialogDescription>{t("confirmDeletePerson")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 px-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteFiles}
                  onChange={(e) => setDeleteFiles(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 accent-destructive"
                />
                <span className="text-sm text-foreground">{t("deleteLocalFiles")}</span>
              </label>
              {deleteFiles && (
                <p className="text-xs text-destructive pl-6">{t("deleteLocalFilesWarning")}</p>
              )}
            </div>
            <DialogFooter>
              <button
                onClick={() => setDeleteOpen(false)}
                className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={() => {
                  onDelete?.(deleteFiles);
                  setDeleteOpen(false);
                  setDeleteFiles(false);
                }}
                className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 cursor-pointer"
              >
                {tCommon("confirm")}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

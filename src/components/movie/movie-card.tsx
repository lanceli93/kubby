"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Star, Heart, CheckCircle, MoreHorizontal, Play, Pencil, ImageIcon, Info, Trash2 } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import { MovieMetadataEditor } from "@/components/movie/movie-metadata-editor";
import { MediaInfoDialog } from "@/components/movie/media-info-dialog";
import { ImageEditorDialog } from "@/components/shared/image-editor-dialog";
import { useUserPreferences } from "@/hooks/use-user-preferences";
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

interface MovieCardProps {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  posterBlur?: string | null;
  rating?: number | null;
  personalRating?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  isFavorite?: boolean;
  isWatched?: boolean;
  progress?: number; // 0-100
  showProgress?: boolean;
  subtitle?: string;
  onToggleFavorite?: () => void;
  onToggleWatched?: () => void;
  onDelete?: (deleteFiles: boolean) => void;
  responsive?: boolean;
}

export function MovieCard({
  id,
  title,
  year,
  posterPath,
  posterBlur,
  rating,
  personalRating,
  videoWidth,
  videoHeight,
  isFavorite,
  isWatched,
  progress,
  showProgress,
  subtitle,
  onToggleFavorite,
  onToggleWatched,
  onDelete,
  responsive,
}: MovieCardProps) {
  const router = useRouter();
  const t = useTranslations("movies");
  const tCommon = useTranslations("common");
  const tMeta = useTranslations("metadata");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [mediaInfoOpen, setMediaInfoOpen] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const { data: prefs } = useUserPreferences();
  const showRatingBadge = prefs?.showMovieRatingBadge !== false;
  const showResBadge = prefs?.showResolutionBadge !== false;

  return (
    <div className={`group flex-shrink-0 transition-[scale] duration-200 ease-out hover:scale-[1.03] has-[[data-state=open]]:scale-[1.03] ${responsive ? "w-full" : ""}`} style={responsive ? undefined : { width: 180 }}>
    <Link
      href={`/movies/${id}`}
    >
      {/* Poster */}
      <div className={`relative w-full overflow-hidden rounded-lg bg-[var(--surface)] ring-1 ring-white/[0.06] ${responsive ? "aspect-[2/3]" : ""}`} style={responsive ? undefined : { height: 270 }}>
        {posterPath ? (
          <Image
            src={resolveImageSrc(posterPath, 360)}
            alt={title}
            fill
            className="object-cover transition-fluid group-hover:scale-105"
            sizes="180px"
            {...(posterBlur ? { placeholder: "blur" as const, blurDataURL: posterBlur } : {})}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No Poster
          </div>
        )}

        {/* Resolution badge — top-left */}
        {showResBadge && (() => {
          const res = getResolutionLabel(videoWidth, videoHeight);
          return res ? (
            <div className="absolute left-1.5 top-1.5 glass-badge rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90">
              {res}
            </div>
          ) : null;
        })()}

        {/* Rating badge — prefer personal rating over community rating */}
        {showRatingBadge && (personalRating != null && personalRating > 0 ? (
          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 glass-badge rounded-full px-1.5 py-0.5">
            <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
            <span className="text-[11px] font-medium text-[var(--gold)]">
              {personalRating.toFixed(1)}
            </span>
          </div>
        ) : rating != null && rating > 0 ? (
          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 glass-badge rounded-full px-1.5 py-0.5">
            <Star className="h-3 w-3 fill-white/50 text-white/50" />
            <span className="text-[11px] font-medium text-white/60">
              {rating.toFixed(1)}
            </span>
          </div>
        ) : null)}

        {/* Centered play button on hover */}
        <div className="absolute inset-0 z-[3] flex items-center justify-center scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-fluid">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/movies/${id}/play`);
            }}
            aria-label={t("play")}
            className="glass-btn flex h-12 w-12 items-center justify-center rounded-full text-white/90 transition-fluid hover:scale-120 active:scale-95"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><polygon points="6,3 20,12 6,21" /></svg>
          </button>
        </div>

        {/* Progress bar */}
        {showProgress && progress != null && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 z-10">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
        )}

        {/* Hover overlay bar — glass, slides up */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-2 py-1.5 backdrop-blur-md bg-black/30 border-t border-white/10 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-has-[[data-state=open]]:translate-y-0 group-has-[[data-state=open]]:opacity-100 transition-fluid z-[5]">
          {/* Left: Watched toggle */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleWatched?.();
            }}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/20 ${
              isWatched ? "text-green-400" : "text-white/70"
            }`}
            title={t("watched")}
          >
            <CheckCircle className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-0.5">
            {/* Favorite toggle */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite?.();
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-white/20 ${
                isFavorite ? "text-red-400" : "text-white/70"
              }`}
              title={t("favorite")}
            >
              <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-400" : ""}`} />
            </button>

            {/* More menu */}
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
                    router.push(`/movies/${id}/play`);
                  }}
                >
                  <Play className="h-4 w-4" />
                  {t("play")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setMetadataOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  {t("editMetadata")}
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
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setMediaInfoOpen(true);
                  }}
                >
                  <Info className="h-4 w-4" />
                  {t("mediaInfo")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("deleteMovie")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Title & year below poster */}
      <div className="mt-1.5 px-0.5 text-center">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        {year && (
          <p className="text-xs text-muted-foreground">{year}</p>
        )}
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground/70">{subtitle}</p>
        )}
      </div>
    </Link>

      {/* Dialogs rendered lazily — only mount when opened to minimize DOM overhead */}
      {metadataOpen && (
        <MovieMetadataEditor
          movieId={id}
          open={metadataOpen}
          onOpenChange={setMetadataOpen}
        />
      )}

      {mediaInfoOpen && (
        <MediaInfoDialog
          movieId={id}
          open={mediaInfoOpen}
          onOpenChange={setMediaInfoOpen}
        />
      )}

      {imageEditorOpen && (
        <ImageEditorDialog
          open={imageEditorOpen}
          onOpenChange={setImageEditorOpen}
          entityType="movie"
          entityId={id}
          entityName={title}
        />
      )}

      {deleteOpen && (
        <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeleteFiles(false); }}>
          <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>{t("deleteMovie")}</DialogTitle>
              <DialogDescription>{t("confirmDeleteMovie")}</DialogDescription>
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

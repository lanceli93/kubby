"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Star, Heart, CheckCircle, MoreHorizontal, Play, Pencil, Info, RefreshCw, Trash2 } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
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

interface MovieCardProps {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  rating?: number | null;
  isFavorite?: boolean;
  isWatched?: boolean;
  progress?: number; // 0-100
  showProgress?: boolean;
  onToggleFavorite?: () => void;
  onToggleWatched?: () => void;
  onDelete?: () => void;
}

export function MovieCard({
  id,
  title,
  year,
  posterPath,
  rating,
  isFavorite,
  isWatched,
  progress,
  showProgress,
  onToggleFavorite,
  onToggleWatched,
  onDelete,
}: MovieCardProps) {
  const router = useRouter();
  const t = useTranslations("movies");
  const tCommon = useTranslations("common");
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <Link
      href={`/movies/${id}`}
      className="group flex-shrink-0 transition-transform hover:scale-[1.03]"
      style={{ width: 180 }}
    >
      {/* Poster */}
      <div className="relative w-full overflow-hidden rounded-lg bg-[var(--surface)]" style={{ height: 270 }}>
        {posterPath ? (
          <Image
            src={resolveImageSrc(posterPath)}
            alt={title}
            fill
            className="object-cover"
            sizes="180px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No Poster
          </div>
        )}

        {/* Rating badge */}
        {rating != null && rating > 0 && (
          <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5">
            <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
            <span className="text-[11px] font-medium text-[var(--gold)]">
              {rating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Favorite indicator (static, shown when not hovering or always) */}
        {isFavorite && (
          <div className="absolute left-2 top-2 group-hover:opacity-0 transition-opacity">
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
          </div>
        )}

        {/* Progress bar */}
        {showProgress && progress != null && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20 z-10">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Hover overlay bar */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-[5]">
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
                className="w-48"
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
                    alert("Edit metadata — coming soon");
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  {t("editMetadata")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    alert("Media info — coming soon");
                  }}
                >
                  <Info className="h-4 w-4" />
                  {t("mediaInfo")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    alert("Refresh metadata — coming soon");
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  {t("refreshMetadata")}
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
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          className="border-white/[0.06] bg-card sm:max-w-[400px]"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("deleteMovie")}</DialogTitle>
            <DialogDescription>{t("confirmDeleteMovie")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDeleteOpen(false);
              }}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete?.();
                setDeleteOpen(false);
              }}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              {tCommon("confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Link>
  );
}

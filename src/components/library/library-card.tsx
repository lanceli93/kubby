"use client";

import { useState } from "react";
import Link from "next/link";
import { Film, Folder, MoreHorizontal, RefreshCw, Pencil, Trash2, HardDriveDownload } from "lucide-react";
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

interface LibraryCardProps {
  id: string;
  name: string;
  type: string;
  movieCount?: number;
  onScan?: () => void;
  onDelete?: () => void;
}

export function LibraryCard({ id, name, type, movieCount, onScan, onDelete }: LibraryCardProps) {
  const t = useTranslations("movies");
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <Link
      href={`/movies?libraryId=${id}`}
      className="group relative flex-shrink-0 overflow-hidden rounded-lg transition-transform hover:scale-[1.02]"
      style={{ width: 320, height: 180 }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--surface)] transition-colors group-hover:bg-[#1f1f38]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          {type === "movie" ? (
            <Film className="h-6 w-6 text-primary" />
          ) : (
            <Folder className="h-6 w-6 text-primary" />
          )}
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-foreground">{name}</p>
          {movieCount != null && (
            <p className="text-xs text-muted-foreground">
              {t("moviesCount", { count: movieCount })}
            </p>
          )}
        </div>
      </div>

      {/* Hover: ⋯ menu button */}
      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70"
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
                onScan?.();
              }}
            >
              <HardDriveDownload className="h-4 w-4" />
              {tHome("scanLibrary")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                alert("Refresh metadata — coming soon");
              }}
            >
              <RefreshCw className="h-4 w-4" />
              {tHome("refreshMetadata")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                alert("Edit library — coming soon");
              }}
            >
              <Pencil className="h-4 w-4" />
              {tHome("editLibrary")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              {tHome("deleteLibrary")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
            <DialogTitle>{tHome("deleteLibrary")}</DialogTitle>
            <DialogDescription>{tHome("confirmDeleteLibrary")}</DialogDescription>
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

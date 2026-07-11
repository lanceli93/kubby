"use client";

import { use, useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowLeft, MoreHorizontal, Pencil, Trash2, CheckSquare, X, ImageMinus } from "lucide-react";
import { PhotoGrid, type PhotoItem } from "@/components/photos/photo-grid";
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
} from "@/components/ui/dialog";

interface AlbumDetail {
  id: string;
  libraryId: string;
  name: string;
  coverItemId: string | null;
  itemCount: number;
}

export default function AlbumDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: albumId } = use(params);
  const t = useTranslations("photos");
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadedItems, setLoadedItems] = useState<PhotoItem[]>([]);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: album } = useQuery<AlbumDetail>({
    queryKey: ["photo-album", albumId],
    queryFn: () => fetch(`/api/photos/albums/${albumId}`).then((r) => r.json()),
  });

  const openPhoto = useCallback(
    (id: string) => router.push(`/photos/view/${id}?album=${albumId}`),
    [router, albumId],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const removeItems = useMutation({
    mutationFn: (itemIds: string[]) =>
      fetch(`/api/photos/albums/${albumId}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["photos", { libraryId: null, albumId }],
      });
      queryClient.invalidateQueries({ queryKey: ["photo-album", albumId] });
      queryClient.invalidateQueries({ queryKey: ["photo-albums"] });
      exitSelection();
    },
  });

  const deleteAlbum = useMutation({
    mutationFn: () => fetch(`/api/photos/albums/${albumId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photo-albums"] });
      router.push("/photos");
    },
  });

  const selectedCount = selectedIds.size;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[var(--header)] px-4 py-3 md:px-6">
        {selectionMode ? (
          <>
            <button
              type="button"
              onClick={exitSelection}
              aria-label={t("close")}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="flex-1 text-sm font-medium text-foreground">
              {t("selectedCount", { count: selectedCount })}
            </span>
            <button
              type="button"
              disabled={selectedCount === 0 || removeItems.isPending}
              onClick={() => removeItems.mutate([...selectedIds])}
              className="focus-ring flex items-center gap-2 rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-white/10 disabled:opacity-40"
            >
              <ImageMinus className="h-4 w-4" />
              {t("removeFromAlbum")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => router.push("/photos")}
              aria-label={t("close")}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex flex-1 items-baseline gap-3">
              <h1 className="truncate text-xl font-semibold text-foreground">
                {album?.name ?? ""}
              </h1>
              {album && (
                <span className="text-sm text-muted-foreground">
                  {t("photoCount", { count: album.itemCount })}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              aria-label={t("select")}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <CheckSquare className="h-5 w-5" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("albumOptions")}
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <MoreHorizontal className="h-5 w-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-44 border-white/10 bg-black/70 backdrop-blur-xl"
              >
                <DropdownMenuItem onClick={() => setRenameOpen(true)} className="cursor-pointer">
                  <Pencil className="h-4 w-4" />
                  {t("renameAlbum")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                  className="cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("deleteAlbum")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {/* Grid */}
      <PhotoGrid
        albumId={albumId}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onOpen={openPhoto}
        onItemsChange={setLoadedItems}
        emptyText={t("albumEmpty")}
      />

      {renameOpen && album && (
        <RenameAlbumDialog
          albumId={albumId}
          currentName={album.name}
          onClose={() => setRenameOpen(false)}
        />
      )}

      {deleteOpen && (
        <Dialog open onOpenChange={(open) => !open && setDeleteOpen(false)}>
          <DialogContent className="!bg-black/50 border-white/[0.08] backdrop-blur-2xl sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>{t("deleteAlbum")}</DialogTitle>
              <DialogDescription>{t("deleteAlbumConfirm")}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="focus-ring rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("close")}
              </button>
              <button
                type="button"
                disabled={deleteAlbum.isPending}
                onClick={() => deleteAlbum.mutate()}
                className="focus-ring rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-40"
              >
                {t("deleteAlbum")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* loadedItems is tracked for potential future select-all; referenced to
          keep the setter meaningful. */}
      <span className="hidden">{loadedItems.length}</span>
    </div>
  );
}

function RenameAlbumDialog({
  albumId,
  currentName,
  onClose,
}: {
  albumId: string;
  currentName: string;
  onClose: () => void;
}) {
  const t = useTranslations("photos");
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName);

  const rename = useMutation({
    mutationFn: (newName: string) =>
      fetch(`/api/photos/albums/${albumId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photo-album", albumId] });
      queryClient.invalidateQueries({ queryKey: ["photo-albums"] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!bg-black/50 border-white/[0.08] backdrop-blur-2xl sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t("renameAlbum")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (trimmed && !rename.isPending) rename.mutate(trimmed);
          }}
          className="space-y-3"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="focus-ring rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("close")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || rename.isPending}
              className="focus-ring rounded-lg bg-primary/25 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/35 disabled:opacity-40"
            >
              {t("create")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

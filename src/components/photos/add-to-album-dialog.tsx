"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, Check, Images } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GlassToast } from "@/components/ui/glass-toast";

interface Album {
  id: string;
  name: string;
  coverItemId: string | null;
  itemCount: number;
}

// Picks an existing album (or creates a new one) and adds the given photos to
// it. Used from the timeline's multi-select action bar and from the lightbox.
// Albums are scoped to a single photo library.
export function AddToAlbumDialog({
  libraryId,
  itemIds,
  onClose,
  onDone,
}: {
  libraryId: string;
  itemIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("photos");
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const { data: albums = [], isLoading } = useQuery<Album[]>({
    queryKey: ["photo-albums", libraryId],
    queryFn: () =>
      fetch(`/api/photos/albums?libraryId=${libraryId}`).then((r) => r.json()),
  });

  const addToAlbum = useMutation({
    mutationFn: (albumId: string) =>
      fetch(`/api/photos/albums/${albumId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      }).then((r) => r.json()),
    onSuccess: (_data, albumId) => {
      queryClient.invalidateQueries({ queryKey: ["photo-albums"] });
      queryClient.invalidateQueries({
        queryKey: ["photos", { libraryId: null, albumId }],
      });
      setToast(t("addedToAlbum", { count: itemIds.length }));
      window.setTimeout(onDone, 900);
    },
  });

  const createAndAdd = useMutation({
    mutationFn: async (name: string) => {
      const album = await fetch(`/api/photos/albums`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, libraryId }),
      }).then((r) => r.json());
      if (!album?.id) throw new Error("create failed");
      await fetch(`/api/photos/albums/${album.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds }),
      });
      return album;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photo-albums"] });
      setToast(t("addedToAlbum", { count: itemIds.length }));
      window.setTimeout(onDone, 900);
    },
  });

  const busy = addToAlbum.isPending || createAndAdd.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!bg-black/50 border-white/[0.08] backdrop-blur-2xl sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t("addToAlbum")}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {/* Create-new row */}
          {creating ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = newName.trim();
                if (name && !busy) createAndAdd.mutate(name);
              }}
              className="flex items-center gap-2 px-1 py-2"
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("albumNamePlaceholder")}
                className="flex-1 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <button
                type="submit"
                disabled={!newName.trim() || busy}
                className="focus-ring rounded-md bg-primary/25 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/35 disabled:opacity-40"
              >
                {t("create")}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-white/[0.06]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/[0.06] text-primary">
                <Plus className="h-5 w-5" />
              </span>
              {t("newAlbum")}
            </button>
          )}

          {isLoading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              …
            </div>
          ) : (
            albums.map((album) => (
              <button
                key={album.id}
                type="button"
                disabled={busy}
                onClick={() => addToAlbum.mutate(album.id)}
                className="focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/[0.06]">
                  {album.coverItemId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/photos/${album.coverItemId}/thumb`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Images className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">
                    {album.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("photoCount", { count: album.itemCount })}
                  </span>
                </span>
                {addToAlbum.isPending &&
                  addToAlbum.variables === album.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
              </button>
            ))
          )}
        </div>
      </DialogContent>

      <GlassToast visible={!!toast} className="z-[100]">
        {toast}
      </GlassToast>
    </Dialog>
  );
}

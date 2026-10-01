"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { GlassToast } from "@/components/ui/glass-toast";
import { fetchJsonOrThrow } from "@/lib/photos/fetch-json";

export interface DeletePhotosResult {
  deleted: string[];
  failed: { id: string; error: string }[];
}

// Admin-only confirm dialog that permanently deletes photos/videos (source
// file + thumbs + row). One id → DELETE /api/photos/[id]; several → the bulk
// POST /api/photos/delete. On a total failure the dialog stays open with an
// error toast; otherwise the photo caches are invalidated and `onDeleted`
// receives the per-item outcome (partial failures included) so the caller can
// navigate / report.
export function DeletePhotosDialog({
  ids,
  onClose,
  onDeleted,
}: {
  ids: string[];
  onClose: () => void;
  onDeleted: (result: DeletePhotosResult) => void;
}) {
  const t = useTranslations("photos");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const single = ids.length === 1;

  const del = useMutation({
    mutationFn: async (): Promise<DeletePhotosResult> => {
      if (single) {
        await fetchJsonOrThrow(`/api/photos/${ids[0]}`, { method: "DELETE" });
        return { deleted: [ids[0]], failed: [] };
      }
      return fetchJsonOrThrow<DeletePhotosResult>(`/api/photos/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: (result) => {
      for (const id of result.deleted) {
        queryClient.removeQueries({ queryKey: ["photo", id] });
      }
      // Every timeline / library / album scope, plus album counts & covers.
      queryClient.invalidateQueries({ queryKey: ["photos"] });
      queryClient.invalidateQueries({ queryKey: ["photo-albums"] });
      queryClient.invalidateQueries({ queryKey: ["photo-album"] });
      onDeleted(result);
    },
    onError: (e) => {
      setError(t("deleteFailed", { error: (e as Error).message }));
      window.setTimeout(() => setError(null), 4000);
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !del.isPending && onClose()}>
      <DialogContent className="!bg-black/50 border-white/[0.08] backdrop-blur-2xl sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {single ? t("deletePhoto") : t("deleteSelectedTitle", { count: ids.length })}
          </DialogTitle>
          <DialogDescription>
            {single
              ? t("deletePhotoConfirm")
              : t("deleteSelectedConfirm", { count: ids.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={del.isPending}
            onClick={onClose}
            className="focus-ring rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={del.isPending || ids.length === 0}
            onClick={() => del.mutate()}
            className="focus-ring rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-40"
          >
            {t("delete")}
          </button>
        </div>
      </DialogContent>

      <GlassToast visible={!!error} success={false} className="z-[100]">
        {error}
      </GlassToast>
    </Dialog>
  );
}

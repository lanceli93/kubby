"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, Images } from "lucide-react";
import { usePhotoLibraries } from "@/hooks/use-photo-libraries";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Album {
  id: string;
  libraryId: string;
  name: string;
  coverItemId: string | null;
  itemCount: number;
}

// Album grid view (the "Albums" tab of /photos). Cards show a cover + name +
// count; a leading "new album" card creates one. Albums are scoped to a photo
// library; when a library filter is active only its albums show, otherwise all.
export function AlbumsView({ libraryId }: { libraryId: string | null }) {
  const t = useTranslations("photos");
  const photoLibraries = usePhotoLibraries();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: albums = [], isLoading } = useQuery<Album[]>({
    queryKey: ["photo-albums", libraryId ?? "all"],
    queryFn: () => {
      const qs = libraryId ? `?libraryId=${libraryId}` : "";
      return fetch(`/api/photos/albums${qs}`).then((r) => r.json());
    },
  });

  // The library a new album belongs to: the active filter, else the sole photo
  // library. With multiple libraries and no filter, creation asks which one.
  const defaultLibraryId =
    libraryId ?? (photoLibraries.length === 1 ? photoLibraries[0].id : null);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {/* New album card */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="focus-ring group flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-white/[0.04] hover:text-foreground"
        >
          <Plus className="h-8 w-8" />
          <span className="text-sm font-medium">{t("newAlbum")}</span>
        </button>

        {isLoading
          ? [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-xl bg-white/[0.05]"
              />
            ))
          : albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
      </div>

      {createOpen && (
        <CreateAlbumDialog
          defaultLibraryId={defaultLibraryId}
          libraries={photoLibraries}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

function AlbumCard({ album }: { album: Album }) {
  const t = useTranslations("photos");
  return (
    <Link
      href={`/photos/album/${album.id}`}
      className="focus-ring group flex flex-col gap-2 rounded-xl"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/[0.06] transition-shadow duration-200 group-hover:ring-white/20">
        {album.coverItemId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/photos/${album.coverItemId}/thumb`}
            alt={album.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Images className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="px-0.5">
        <p className="truncate text-sm font-medium text-foreground">{album.name}</p>
        <p className="text-xs text-muted-foreground">
          {t("photoCount", { count: album.itemCount })}
        </p>
      </div>
    </Link>
  );
}

function CreateAlbumDialog({
  defaultLibraryId,
  libraries,
  onClose,
}: {
  defaultLibraryId: string | null;
  libraries: { id: string; name: string }[];
  onClose: () => void;
}) {
  const t = useTranslations("photos");
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [libId, setLibId] = useState<string | null>(defaultLibraryId);

  const create = useMutation({
    mutationFn: (payload: { name: string; libraryId: string }) =>
      fetch(`/api/photos/albums`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["photo-albums"] });
      onClose();
    },
  });

  const needsLibraryChoice = !defaultLibraryId && libraries.length > 1;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!bg-black/50 border-white/[0.08] backdrop-blur-2xl sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t("newAlbum")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            const targetLib = libId ?? defaultLibraryId;
            if (trimmed && targetLib && !create.isPending) {
              create.mutate({ name: trimmed, libraryId: targetLib });
            }
          }}
          className="space-y-3"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("albumNamePlaceholder")}
            className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
          />

          {needsLibraryChoice && (
            <select
              value={libId ?? ""}
              onChange={(e) => setLibId(e.target.value || null)}
              required
              className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            >
              <option value="" disabled>
                {t("chooseLibrary")}
              </option>
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id} className="bg-neutral-900">
                  {lib.name}
                </option>
              ))}
            </select>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("close")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || create.isPending || (needsLibraryChoice && !libId)}
              className="rounded-lg bg-primary/25 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/35 disabled:opacity-40"
            >
              {t("create")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

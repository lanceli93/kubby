"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { Upload, Trash2, ImageIcon, Info } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ImageEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "movie" | "person";
  entityId: string;
  entityName: string;
}

interface MovieData {
  posterPath?: string | null;
  fanartPath?: string | null;
}

interface PersonData {
  photoPath?: string | null;
  fanartPath?: string | null;
  fanartSource?: "own" | "movie" | null;
}

export function ImageEditorDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  entityName,
}: ImageEditorDialogProps) {
  const queryClient = useQueryClient();
  const tMeta = useTranslations("metadata");
  const tCommon = useTranslations("common");
  const [uploading, setUploading] = useState<"poster" | "fanart" | null>(null);
  const [deleting, setDeleting] = useState<"poster" | "fanart" | null>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const fanartInputRef = useRef<HTMLInputElement>(null);

  const apiBase = entityType === "movie"
    ? `/api/movies/${entityId}`
    : `/api/people/${entityId}`;

  const queryKey = entityType === "movie"
    ? ["movie", entityId]
    : ["person", entityId];

  const { data, refetch } = useQuery<MovieData | PersonData>({
    queryKey: [...queryKey, "images"],
    queryFn: () => fetch(apiBase).then((r) => r.json()),
    enabled: open,
  });

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setUploading(null);
      setDeleting(null);
    }
  }, [open]);

  const posterPath = entityType === "movie"
    ? (data as MovieData)?.posterPath
    : (data as PersonData)?.photoPath;
  const fanartPath = data?.fanartPath;
  const fanartSource = entityType === "person"
    ? (data as PersonData)?.fanartSource
    : null;

  const handleUpload = async (type: "poster" | "fanart", file: File) => {
    setUploading(type);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await fetch(`${apiBase}/images?type=${type}`, {
        method: "POST",
        body: formData,
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey });
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (type: "poster" | "fanart") => {
    setDeleting(type);
    try {
      await fetch(`${apiBase}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey });
    } finally {
      setDeleting(null);
    }
  };

  const onFileSelected = (type: "poster" | "fanart") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(type, file);
    }
    e.target.value = "";
  };

  const isMovieDerivedFanart = entityType === "person" && fanartSource === "movie";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-white/[0.06] bg-card sm:max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{tMeta("editImages")} — {entityName}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 pt-2">
          {/* Poster Card */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-foreground">{tMeta("poster")}</h3>
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-[var(--surface)]">
              {posterPath ? (
                <Image
                  src={resolveImageSrc(posterPath)}
                  alt="Poster"
                  fill
                  className="object-cover"
                  sizes="300px"
                  key={posterPath}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-10 w-10 opacity-40" />
                  <span className="text-sm">{tMeta("noImage")}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => posterInputRef.current?.click()}
                disabled={uploading !== null || deleting !== null}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-white/10 disabled:opacity-50 cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                {posterPath ? tMeta("replaceImage") : tMeta("uploadImage")}
              </button>
              {posterPath && (
                <button
                  onClick={() => handleDelete("poster")}
                  disabled={uploading !== null || deleting !== null}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  {tMeta("deleteImage")}
                </button>
              )}
            </div>
            <input
              ref={posterInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileSelected("poster")}
            />
          </div>

          {/* Fanart Card */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-foreground">{tMeta("fanart")}</h3>
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-[var(--surface)]">
              {fanartPath ? (
                <>
                  <Image
                    src={resolveImageSrc(fanartPath)}
                    alt="Fanart"
                    fill
                    className="object-cover"
                    sizes="400px"
                    key={fanartPath}
                  />
                  {isMovieDerivedFanart && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs text-white/70">
                      <Info className="h-3 w-3" />
                      {tMeta("usingMovieFanart")}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImageIcon className="h-10 w-10 opacity-40" />
                  <span className="text-sm">{tMeta("noImage")}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => fanartInputRef.current?.click()}
                disabled={uploading !== null || deleting !== null}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-white/10 disabled:opacity-50 cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                {fanartPath && !isMovieDerivedFanart ? tMeta("replaceImage") : tMeta("uploadImage")}
              </button>
              {fanartPath && !isMovieDerivedFanart && (
                <button
                  onClick={() => handleDelete("fanart")}
                  disabled={uploading !== null || deleting !== null}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  {tMeta("deleteImage")}
                </button>
              )}
            </div>
            <input
              ref={fanartInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileSelected("fanart")}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

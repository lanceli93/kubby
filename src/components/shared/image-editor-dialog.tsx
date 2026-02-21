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

  const busy = uploading !== null || deleting !== null;
  const isMovieDerivedFanart = entityType === "person" && fanartSource === "movie";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>{tMeta("editImages")}</DialogTitle>
        </DialogHeader>

        {/* Single row: poster (2:3) left + fanart (16:9) right, top-aligned */}
        <div className="flex items-start gap-4 pt-1">
          {/* Poster */}
          <div className="flex w-[200px] flex-shrink-0 flex-col gap-2">
            <h3 className="text-xs font-medium text-white/50">{tMeta("poster")}</h3>
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-white/[0.04] border border-white/[0.06]">
              {posterPath ? (
                <Image
                  src={resolveImageSrc(posterPath)}
                  alt="Poster"
                  fill
                  className="object-cover"
                  sizes="200px"
                  key={posterPath}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-white/30">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs">{tMeta("noImage")}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => posterInputRef.current?.click()}
                disabled={busy}
                className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 cursor-pointer"
              >
                {posterPath ? tMeta("replaceImage") : tMeta("uploadImage")}
              </button>
              {posterPath && (
                <button
                  onClick={() => handleDelete("poster")}
                  disabled={busy}
                  className="rounded-md border border-red-500/20 bg-red-500/10 px-1.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
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

          {/* Fanart */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-medium text-white/50">{tMeta("fanart")}</h3>
              {isMovieDerivedFanart && (
                <span className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/40">
                  <Info className="h-3 w-3" />
                  {tMeta("usingMovieFanart")}
                </span>
              )}
            </div>
            <div className="relative h-[300px] w-full overflow-hidden rounded-md bg-white/[0.04] border border-white/[0.06]">
              {fanartPath ? (
                <Image
                  src={resolveImageSrc(fanartPath)}
                  alt="Fanart"
                  fill
                  className="object-cover"
                  sizes="520px"
                  key={fanartPath}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-white/30">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-xs">{tMeta("noImage")}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => fanartInputRef.current?.click()}
                disabled={busy}
                className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 cursor-pointer"
              >
                {fanartPath && !isMovieDerivedFanart ? tMeta("replaceImage") : tMeta("uploadImage")}
              </button>
              {fanartPath && !isMovieDerivedFanart && (
                <button
                  onClick={() => handleDelete("fanart")}
                  disabled={busy}
                  className="rounded-md border border-red-500/20 bg-red-500/10 px-1.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
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

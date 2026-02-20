"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Film, Folder, MoreHorizontal, Pencil, Trash2, HardDriveDownload, ImageIcon, ImageOff, Plus, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
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
import { FolderPicker } from "@/components/library/folder-picker";

interface LibraryCardProps {
  id: string;
  name: string;
  type: string;
  folderPaths?: string[];
  scraperEnabled?: boolean;
  movieCount?: number;
  coverImage?: string | null;
  hasCustomCover?: boolean;
  onScanComplete?: () => void;
  onEditComplete?: () => void;
  onDelete?: () => void;
  onEditImage?: () => void;
  onRemoveImage?: () => void;
}

export function LibraryCard({ id, name, type, folderPaths, scraperEnabled, movieCount, coverImage, hasCustomCover, onScanComplete, onEditComplete, onDelete, onEditImage, onRemoveImage }: LibraryCardProps) {
  const t = useTranslations("movies");
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editFolderPaths, setEditFolderPaths] = useState<string[]>(folderPaths ?? []);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [editFolderPickerOpen, setEditFolderPickerOpen] = useState(false);
  const [editScraperEnabled, setEditScraperEnabled] = useState(scraperEnabled ?? false);
  const [editSaving, setEditSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);

  const handleEditSave = async () => {
    setEditSaving(true);
    try {
      await fetch(`/api/libraries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, folderPaths: editFolderPaths, scraperEnabled: editScraperEnabled }),
      });
      setEditOpen(false);
      onEditComplete?.();
    } catch {
      // ignore
    } finally {
      setEditSaving(false);
    }
  };

  const startScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanResult(null);
    setScanProgress(null);
    try {
      const res = await fetch(`/api/libraries/${id}/scan`, { method: "POST" });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let scannedCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const match = line.match(/^data: (.+)$/m);
          if (!match) continue;
          const data = JSON.parse(match[1]);
          if (data.done) {
            scannedCount = data.scannedCount ?? 0;
          } else if (data.error) {
            throw new Error(data.error);
          } else if (data.total) {
            setScanProgress({ current: data.current, total: data.total });
          }
        }
      }
      setScanResult(tHome("scanComplete", { count: scannedCount }));
      onScanComplete?.();
      setTimeout(() => setScanResult(null), 3000);
    } catch {
      setScanResult(tHome("scanFailed"));
      setTimeout(() => setScanResult(null), 3000);
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  };

  return (
    <Link
      href={`/movies?libraryId=${id}`}
      className="group flex-shrink-0 transition-transform hover:scale-[1.03]"
      style={{ width: 320 }}
    >
      {/* Cover image area */}
      <div className="relative w-full overflow-hidden rounded-[4px] bg-[var(--surface)]" style={{ height: 180 }}>
        {coverImage ? (
          <Image
            src={resolveImageSrc(coverImage)}
            alt={name}
            fill
            className="object-cover"
            sizes="320px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              {type === "movie" ? (
                <Film className="h-6 w-6 text-primary" />
              ) : (
                <Folder className="h-6 w-6 text-primary" />
              )}
            </div>
          </div>
        )}

        {/* Library name overlay */}
        <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black/40 pointer-events-none">
          <h2 className="font-bold text-white drop-shadow-lg px-4 text-center leading-tight" style={{ fontSize: 40 }}>{name}</h2>
        </div>

        {/* Scanning overlay with progress */}
        {scanning && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-black/60 px-8">
            {scanProgress ? (
              <>
                <Progress value={(scanProgress.current / scanProgress.total) * 100} className="h-1.5 w-full" />
                <span className="text-xs text-white/80">
                  {tHome("scanProgress", { current: scanProgress.current, total: scanProgress.total })}
                </span>
              </>
            ) : (
              <span className="text-xs text-white/80">{tHome("scanning")}</span>
            )}
          </div>
        )}

        {/* Hover: ⋯ menu button */}
        <div className="absolute inset-x-0 bottom-0 flex justify-end px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-[5]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/20 outline-none"
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
                disabled={scanning}
                onClick={(e) => {
                  e.stopPropagation();
                  startScan();
                }}
              >
                <HardDriveDownload className="h-4 w-4" />
                {tHome("scanLibrary")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setEditName(name);
                  setEditFolderPaths(folderPaths ?? []);
                  setNewFolderPath("");
                  setEditScraperEnabled(scraperEnabled ?? false);
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                {tHome("editLibrary")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEditImage?.();
                }}
              >
                <ImageIcon className="h-4 w-4" />
                {tHome("editImage")}
              </DropdownMenuItem>
              {hasCustomCover && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveImage?.();
                  }}
                >
                  <ImageOff className="h-4 w-4" />
                  {tHome("removeImage")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
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
      </div>

      {/* Name & count below card */}
      <div className="mt-1.5 px-0.5 text-center">
        <p className="truncate text-base font-semibold text-foreground">{name}</p>
        {scanResult ? (
          <p className="text-xs text-primary">{scanResult}</p>
        ) : movieCount != null ? (
          <p className="text-xs text-muted-foreground">
            {t("moviesCount", { count: movieCount })}
          </p>
        ) : null}
      </div>

      {/* Edit library dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          className="border-white/[0.06] bg-card sm:max-w-[440px]"
          onClick={(e) => { e.stopPropagation(); }}
        >
          <DialogHeader>
            <DialogTitle>{tHome("editLibrary")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}
            className="flex flex-col gap-4 pt-2"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">{tHome("libraryName")}</label>
              <input
                type="text"
                value={editName}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEditName(e.target.value)}
                className="h-10 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3 text-sm text-foreground focus:border-primary focus:outline-none"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">{tHome("folderPaths")}</label>
              <div className="flex flex-col gap-2">
                {editFolderPaths.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 min-w-0">
                    <span className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3 py-2 font-mono text-sm text-foreground">
                      {p}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditFolderPaths(editFolderPaths.filter((_, i) => i !== idx));
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newFolderPath}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setNewFolderPath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newFolderPath.trim()) {
                        e.preventDefault();
                        setEditFolderPaths([...editFolderPaths, newFolderPath.trim()]);
                        setNewFolderPath("");
                      }
                    }}
                    placeholder="/path/to/media"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3 font-mono text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditFolderPickerOpen(true);
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  >
                    <Folder className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!newFolderPath.trim()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (newFolderPath.trim()) {
                        setEditFolderPaths([...editFolderPaths, newFolderPath.trim()]);
                        setNewFolderPath("");
                      }
                    }}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.06] px-3 text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {tHome("addFolder")}
                  </button>
                </div>
              </div>
              <FolderPicker
                open={editFolderPickerOpen}
                onOpenChange={setEditFolderPickerOpen}
                onSelect={(p) => {
                  setEditFolderPaths([...editFolderPaths, p]);
                }}
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editScraperEnabled}
                onChange={(e) => setEditScraperEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-white/[0.06] accent-primary"
              />
              <span className="text-sm text-foreground">{tHome("enableScraper")}</span>
            </label>
            <DialogFooter>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditOpen(false); }}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {editSaving ? tCommon("loading") : tCommon("save")}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Film, Folder, MoreHorizontal, Pencil, Trash2, HardDriveDownload, ImageIcon, ImageOff, Plus, X, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import { useLibraryScan } from "@/providers/scan-provider";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LibraryCardProps {
  id: string;
  name: string;
  type: string;
  folderPaths?: string[];
  scraperEnabled?: boolean;
  jellyfinCompat?: boolean;
  metadataLanguage?: string | null;
  movieCount?: number;
  coverImage?: string | null;
  hasCustomCover?: boolean;
  lastScannedAt?: string | null;
  onScanComplete?: () => void;
  onEditComplete?: () => void;
  onDelete?: (options: { cleanupOrphans: boolean; deleteNfo: boolean }) => void;
  onEditImage?: () => void;
  onRemoveImage?: () => void;
}

export function LibraryCard({ id, name, type, folderPaths, scraperEnabled, jellyfinCompat, metadataLanguage, movieCount, coverImage, hasCustomCover, lastScannedAt, onScanComplete, onEditComplete, onDelete, onEditImage, onRemoveImage }: LibraryCardProps) {
  const t = useTranslations("movies");
  const tHome = useTranslations("home");
  const tCommon = useTranslations("common");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cleanupOrphans, setCleanupOrphans] = useState(true);
  const [deleteNfo, setDeleteNfo] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editFolderPaths, setEditFolderPaths] = useState<string[]>(folderPaths ?? []);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [editFolderPickerOpen, setEditFolderPickerOpen] = useState(false);
  const [editScraperEnabled, setEditScraperEnabled] = useState(scraperEnabled ?? false);
  const [editMetadataLanguage, setEditMetadataLanguage] = useState(metadataLanguage || "en");
  const [editTmdbConfigured, setEditTmdbConfigured] = useState<boolean | null>(null);
  const [editScraperError, setEditScraperError] = useState("");
  const [editJellyfinCompat, setEditJellyfinCompat] = useState(jellyfinCompat ?? false);
  const [jellyfinCompatConfirmOpen, setJellyfinCompatConfirmOpen] = useState(false);
  const [jellyfinCompatConfirmAction, setJellyfinCompatConfirmAction] = useState<"enable" | "disable">("enable");
  const [editSaving, setEditSaving] = useState(false);
  const libScan = useLibraryScan(id);
  const scanning = libScan.scanning;
  const scanProgress = libScan.progress;
  const isUnscanned = !lastScannedAt && !scanning;
  const isDone = libScan.result?.startsWith("done:");
  const doneScannedCount = isDone ? parseInt(libScan.result!.split(":")[1], 10) : 0;
  const doneSkippedCount = isDone ? parseInt(libScan.result!.split(":")[2] || "0", 10) : 0;
  const scanResult = isDone
    ? (doneSkippedCount > 0
        ? tHome("scanCompleteWithSkipped", { count: doneScannedCount, skipped: doneSkippedCount })
        : tHome("scanComplete", { count: doneScannedCount }))
    : libScan.result === "error"
      ? tHome("scanFailed")
      : null;

  const handleEditSave = async () => {
    setEditSaving(true);
    try {
      await fetch(`/api/libraries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, folderPaths: editFolderPaths, scraperEnabled: editScraperEnabled, jellyfinCompat: editJellyfinCompat, metadataLanguage: editMetadataLanguage === "en" ? null : editMetadataLanguage }),
      });
      setEditOpen(false);
      onEditComplete?.();
    } catch {
      // ignore
    } finally {
      setEditSaving(false);
    }
  };

  const startScan = () => libScan.startScan();

  return (
    <Link
      href={`/movies?libraryId=${id}`}
      className="group flex-shrink-0 transition-transform hover:scale-[1.03]"
      style={{ width: 360 }}
    >
      {/* Cover image area */}
      <div className="relative w-full overflow-hidden rounded-[4px] bg-[var(--surface)]" style={{ height: 200 }}>
        {coverImage ? (
          <Image
            src={resolveImageSrc(coverImage)}
            alt={name}
            fill
            className="object-cover"
            sizes="360px"
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
                <span className="max-w-full truncate text-xs text-white/80">
                  {scanProgress.title
                    ? tHome("scanProgressWithTitle", { title: scanProgress.title, current: scanProgress.current, total: scanProgress.total })
                    : tHome("scanProgress", { current: scanProgress.current, total: scanProgress.total })}
                </span>
              </>
            ) : (
              <span className="text-xs text-white/80">{tHome("scanning")}</span>
            )}
          </div>
        )}

        {/* Unscanned overlay */}
        {isUnscanned && !isDone && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/50">
            <span className="text-xs text-white/60">{tHome("unscanned")}</span>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startScan();
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {tHome("clickToScan")}
            </button>
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
                  setEditJellyfinCompat(jellyfinCompat ?? false);
                  setEditMetadataLanguage(metadataLanguage || "en");
                  setEditScraperError("");
                  fetch("/api/settings/scraper").then((r) => r.json()).then((d) => setEditTmdbConfigured(d.configured)).catch(() => setEditTmdbConfigured(false));
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
            className="flex flex-col gap-4 pt-2 overflow-hidden"
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
                    <span title={p} className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3 py-2 font-mono text-sm text-foreground">
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
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground disabled:opacity-30"
                  >
                    <Plus className="h-4 w-4" />
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
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                Metadata downloaders (Movies)
              </label>
              <div className="rounded-lg border border-white/[0.06] bg-[var(--input-bg)]">
                <label className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                  <input
                    type="checkbox"
                    checked={editScraperEnabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      if (checked && editTmdbConfigured === false) {
                        setEditScraperError("TMDB API key is not configured. Please set it up in Dashboard > Scraper before enabling.");
                        return;
                      }
                      setEditScraperEnabled(checked);
                    }}
                    className="h-4 w-4 rounded border-white/[0.06] bg-[var(--input-bg)] accent-primary"
                  />
                  <span className="text-sm text-foreground">TheMovieDb</span>
                </label>
              </div>
              <p className="text-xs text-[#555568]">
                Select metadata downloaders to automatically fetch movie info during library scan.
              </p>
            </div>
            {editScraperEnabled && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-muted-foreground">
                  Metadata Language
                </label>
                <Select value={editMetadataLanguage} onValueChange={setEditMetadataLanguage}>
                  <SelectTrigger className="h-10 w-full rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3 text-sm text-foreground" onClick={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-card" onClick={(e) => e.stopPropagation()}>
                    <SelectItem value="en">English (default)</SelectItem>
                    <SelectItem value="zh-CN">简体中文</SelectItem>
                    <SelectItem value="zh-TW">繁體中文</SelectItem>
                    <SelectItem value="ja">日本語</SelectItem>
                    <SelectItem value="ko">한국어</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                    <SelectItem value="ru">Русский</SelectItem>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="th">ไทย</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {editScraperError && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-destructive">{editScraperError}</p>
                  <Link
                    href="/dashboard/scraper"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
                  >
                    Go to Scraper Settings
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditScraperError(""); }}
                  className="shrink-0 text-destructive/60 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                {tHome("jellyfinCompat")}
              </label>
              <div className="rounded-lg border border-white/[0.06] bg-[var(--input-bg)]">
                <label className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                  <input
                    type="checkbox"
                    checked={editJellyfinCompat}
                    onChange={(e) => {
                      e.stopPropagation();
                      setJellyfinCompatConfirmAction(e.target.checked ? "enable" : "disable");
                      setJellyfinCompatConfirmOpen(true);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-white/[0.06] bg-[var(--input-bg)] accent-primary"
                  />
                  <span className="text-sm text-foreground">{tHome("jellyfinCompat")}</span>
                </label>
              </div>
              <p className="text-xs text-[#555568]">
                {tHome("jellyfinCompatHelp")}
              </p>
            </div>
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

      {/* Jellyfin compat confirmation dialog */}
      <Dialog open={jellyfinCompatConfirmOpen} onOpenChange={setJellyfinCompatConfirmOpen}>
        <DialogContent
          className="border-white/[0.06] bg-card sm:max-w-[400px]"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <DialogHeader>
            <DialogTitle>
              {jellyfinCompatConfirmAction === "enable"
                ? tHome("jellyfinCompatDialogTitle")
                : tHome("jellyfinCompatDisableTitle")}
            </DialogTitle>
            <DialogDescription>
              {jellyfinCompatConfirmAction === "enable"
                ? tHome("jellyfinCompatDialogDesc")
                : tHome("jellyfinCompatDisableDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setJellyfinCompatConfirmOpen(false);
              }}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setEditJellyfinCompat(jellyfinCompatConfirmAction === "enable");
                setJellyfinCompatConfirmOpen(false);
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {tCommon("confirm")}
            </button>
          </DialogFooter>
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
          <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <label className="flex items-center gap-2.5 px-1 cursor-pointer">
              <input
                type="checkbox"
                checked={cleanupOrphans}
                onChange={(e) => setCleanupOrphans(e.target.checked)}
                className="h-4 w-4 rounded border-white/[0.06] bg-[var(--input-bg)] accent-primary"
              />
              <span className="text-sm text-muted-foreground">{tHome("cleanupOrphanPeople")}</span>
            </label>
            <label className="flex items-center gap-2.5 px-1 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteNfo}
                onChange={(e) => setDeleteNfo(e.target.checked)}
                className="h-4 w-4 rounded border-white/[0.06] bg-[var(--input-bg)] accent-primary"
              />
              <span className="text-sm text-muted-foreground">{tHome("deleteNfoFiles")}</span>
            </label>
          </div>
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
                onDelete?.({ cleanupOrphans, deleteNfo });
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

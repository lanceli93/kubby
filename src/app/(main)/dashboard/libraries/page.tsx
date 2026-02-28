"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAllScans, useScanActions } from "@/providers/scan-provider";
import Image from "next/image";
import { resolveImageSrc } from "@/lib/image-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Plus, RefreshCw, Trash2, Folder, AlertCircle, X, Film, MoreVertical, Pencil, HardDriveDownload } from "lucide-react";
import { FolderPicker } from "@/components/library/folder-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";

interface Library {
  id: string;
  name: string;
  type: string;
  folderPaths: string[];
  coverImage?: string | null;
  hasCustomCover?: boolean;
  scraperEnabled?: boolean;
  jellyfinCompat?: boolean;
  metadataLanguage?: string | null;
  movieCount?: number;
  lastScannedAt?: string;
}

export default function LibrariesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [name, setName] = useState("");
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [type, setType] = useState("movie");
  const [scraperEnabled, setScraperEnabled] = useState(false);
  const [metadataLanguage, setMetadataLanguage] = useState("en");
  const [tmdbConfigured, setTmdbConfigured] = useState<boolean | null>(null);
  const [scraperError, setScraperError] = useState("");
  const [jellyfinCompat, setJellyfinCompat] = useState(false);
  const [jellyfinCompatConfirmOpen, setJellyfinCompatConfirmOpen] = useState(false);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editLibId, setEditLibId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFolderPaths, setEditFolderPaths] = useState<string[]>([]);
  const [editNewFolderPath, setEditNewFolderPath] = useState("");
  const [editFolderPickerOpen, setEditFolderPickerOpen] = useState(false);
  const [editScraperEnabled, setEditScraperEnabled] = useState(false);
  const [editMetadataLanguage, setEditMetadataLanguage] = useState("en");
  const [editTmdbConfigured, setEditTmdbConfigured] = useState<boolean | null>(null);
  const [editScraperError, setEditScraperError] = useState("");
  const [editJellyfinCompat, setEditJellyfinCompat] = useState(false);
  const [editJellyfinCompatConfirmOpen, setEditJellyfinCompatConfirmOpen] = useState(false);
  const [editJellyfinCompatAction, setEditJellyfinCompatAction] = useState<"enable" | "disable">("enable");
  const [editSaving, setEditSaving] = useState(false);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLibId, setDeleteLibId] = useState<string | null>(null);
  const [deleteLibName, setDeleteLibName] = useState("");
  const [deleteCleanupOrphans, setDeleteCleanupOrphans] = useState(true);
  const [deleteNfo, setDeleteNfo] = useState(false);

  const { data: libraries = [] } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
  });

  // Check if TMDB API key is configured when dialog opens
  const checkTmdbKey = () => {
    fetch("/api/settings/scraper")
      .then((r) => r.json())
      .then((data) => setTmdbConfigured(data.configured))
      .catch(() => setTmdbConfigured(false));
  };

  const createLibrary = useMutation({
    mutationFn: () => {
      const allPaths = newFolderPath.trim()
        ? [...folderPaths, newFolderPath.trim()]
        : folderPaths;
      return fetch("/api/libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, folderPaths: allPaths, scraperEnabled, jellyfinCompat, metadataLanguage: metadataLanguage === "en" ? null : metadataLanguage }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      setOpen(false);
      setName("");
      setFolderPaths([]);
      setNewFolderPath("");
      setScraperEnabled(false);
      setJellyfinCompat(false);
      setMetadataLanguage("en");
    },
  });

  const scansMap = useAllScans();
  const { startScan: ctxStartScan } = useScanActions();
  const startScan = (libId: string) => ctxStartScan(libId);

  const scanAll = () => {
    libraries.forEach((lib) => {
      const libScan = scansMap.get(lib.id);
      if (!libScan?.scanning) {
        ctxStartScan(lib.id);
      }
    });
  };

  const anyScanning = libraries.some((lib) => scansMap.get(lib.id)?.scanning);

  const deleteLibrary = useMutation({
    mutationFn: ({ id, cleanupOrphans, deleteNfo }: { id: string; cleanupOrphans: boolean; deleteNfo: boolean }) =>
      fetch(`/api/libraries/${id}?cleanupOrphans=${cleanupOrphans}&deleteNfo=${deleteNfo}`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["libraries"] }),
  });

  const openEditDialog = (lib: Library) => {
    setEditLibId(lib.id);
    setEditName(lib.name);
    setEditFolderPaths(lib.folderPaths);
    setEditNewFolderPath("");
    setEditScraperEnabled(lib.scraperEnabled ?? false);
    setEditJellyfinCompat(lib.jellyfinCompat ?? false);
    setEditMetadataLanguage(lib.metadataLanguage || "en");
    setEditScraperError("");
    fetch("/api/settings/scraper").then((r) => r.json()).then((d) => setEditTmdbConfigured(d.configured)).catch(() => setEditTmdbConfigured(false));
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editLibId) return;
    setEditSaving(true);
    try {
      await fetch(`/api/libraries/${editLibId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          folderPaths: editNewFolderPath.trim() ? [...editFolderPaths, editNewFolderPath.trim()] : editFolderPaths,
          scraperEnabled: editScraperEnabled,
          jellyfinCompat: editJellyfinCompat,
          metadataLanguage: editMetadataLanguage === "en" ? null : editMetadataLanguage,
        }),
      });
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
    } catch {
      // ignore
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-8 px-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Media Libraries</h1>
        <div className="flex items-center gap-2">
          {libraries.length > 0 && (
            <button
              onClick={scanAll}
              disabled={anyScanning}
              className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.04] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${anyScanning ? "animate-spin" : ""}`} />
              Scan All Libraries
            </button>
          )}
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { checkTmdbKey(); setScraperError(""); } }}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" />
                Add Library
              </button>
            </DialogTrigger>
            <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add Media Library</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createLibrary.mutate();
                }}
                className="flex flex-col gap-5 pt-4 overflow-hidden"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-muted-foreground">
                    Library Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Movies"
                    className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-muted-foreground">
                    Library Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    <option value="movie">Movie</option>
                    <option value="tvshow" disabled>
                      TV Shows (coming soon)
                    </option>
                    <option value="music" disabled>
                      Music (coming soon)
                    </option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-medium text-muted-foreground">
                    Folder Paths
                  </label>
                  <div className="flex flex-col gap-2">
                    {folderPaths.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2 min-w-0">
                        <input
                          type="text"
                          value={p}
                          onChange={(e) => {
                            const updated = [...folderPaths];
                            updated[idx] = e.target.value;
                            setFolderPaths(updated);
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 py-2.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setFolderPaths(folderPaths.filter((_, i) => i !== idx))}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newFolderPath}
                        onChange={(e) => setNewFolderPath(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newFolderPath.trim()) {
                            e.preventDefault();
                            setFolderPaths([...folderPaths, newFolderPath.trim()]);
                            setNewFolderPath("");
                          }
                        }}
                        placeholder="/media/movies"
                        className="h-11 flex-1 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm font-mono text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setFolderPickerOpen(true)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.06] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                      >
                        <Folder className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={!newFolderPath.trim()}
                        onClick={() => {
                          if (newFolderPath.trim()) {
                            setFolderPaths([...folderPaths, newFolderPath.trim()]);
                            setNewFolderPath("");
                          }
                        }}
                        className="flex h-11 items-center gap-1.5 rounded-lg border border-white/[0.06] px-3.5 text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground disabled:opacity-30"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>
                  </div>
                </div>
                <FolderPicker
                  open={folderPickerOpen}
                  onOpenChange={setFolderPickerOpen}
                  onSelect={(p) => {
                    setFolderPaths([...folderPaths, p]);
                  }}
                />
                {/* Metadata downloaders section */}
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-medium text-muted-foreground">
                    Metadata downloaders (Movies)
                  </label>
                  <div className="rounded-lg border border-white/[0.06] bg-[var(--input-bg)]">
                    <label className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                      <input
                        type="checkbox"
                        checked={scraperEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked && tmdbConfigured === false) {
                            setScraperError("TMDB API key is not configured. Please set it up in Dashboard > Scraper before enabling.");
                            return;
                          }
                          setScraperEnabled(checked);
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

                {/* Metadata language */}
                {scraperEnabled && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium text-muted-foreground">
                      Metadata Language
                    </label>
                    <Select value={metadataLanguage} onValueChange={setMetadataLanguage}>
                      <SelectTrigger className="h-11 w-full rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-white/[0.06] bg-card">
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
                    <p className="text-xs text-[#555568]">
                      Language for fetching metadata from TMDB (title, overview, etc.).
                    </p>
                  </div>
                )}

                {/* Jellyfin Compatibility Mode */}
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-medium text-muted-foreground">
                    Jellyfin Compatibility
                  </label>
                  <div className="rounded-lg border border-white/[0.06] bg-[var(--input-bg)]">
                    <label className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                      <input
                        type="checkbox"
                        checked={jellyfinCompat}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setJellyfinCompatConfirmOpen(true);
                          } else {
                            setJellyfinCompat(false);
                          }
                        }}
                        className="h-4 w-4 rounded border-white/[0.06] bg-[var(--input-bg)] accent-primary"
                      />
                      <span className="text-sm text-foreground">Jellyfin Compatibility Mode</span>
                    </label>
                  </div>
                  <p className="text-xs text-[#555568]">
                    Prevents Kubby from writing to NFO files and imports actor photos from Jellyfin local paths.
                  </p>
                </div>

                {/* Jellyfin compat confirmation dialog */}
                <Dialog open={jellyfinCompatConfirmOpen} onOpenChange={setJellyfinCompatConfirmOpen}>
                  <DialogContent className="border-white/[0.06] bg-card sm:max-w-[400px]">
                    <DialogHeader>
                      <DialogTitle>Enable Jellyfin Compatibility?</DialogTitle>
                      <DialogDescription>
                        When enabled, Kubby will never modify or create NFO files in your library folders. Actor photos referenced by local paths in NFO thumb tags will be copied to Kubby&apos;s metadata directory. This is recommended if Jellyfin also uses this library.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <button
                        type="button"
                        onClick={() => setJellyfinCompatConfirmOpen(false)}
                        className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setJellyfinCompat(true);
                          setJellyfinCompatConfirmOpen(false);
                        }}
                        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Enable
                      </button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Scraper error alert */}
                {scraperError && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div className="flex-1">
                      <p className="text-sm text-destructive">{scraperError}</p>
                      <Link
                        href="/dashboard/scraper"
                        className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
                      >
                        Go to Scraper Settings
                      </Link>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScraperError("")}
                      className="shrink-0 text-destructive/60 hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createLibrary.isPending}
                    className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createLibrary.isPending ? "Creating..." : "Create Library"}
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Library cards grid — Jellyfin style with cover images */}
      <div className="flex flex-wrap gap-6">
        {libraries.map((lib) => {
          const libScan = scansMap.get(lib.id);
          const isScanning = libScan?.scanning ?? false;
          const progress = libScan?.progress;
          return (
            <div key={lib.id} className="group flex flex-col" style={{ width: 320 }}>
              {/* Cover image — click to edit */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => openEditDialog(lib)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openEditDialog(lib); }}
                className="relative w-full overflow-hidden rounded-[4px] bg-[var(--surface)] cursor-pointer transition-transform hover:scale-[1.03]"
                style={{ height: 180 }}
              >
                {lib.coverImage ? (
                  <Image
                    src={resolveImageSrc(lib.coverImage)}
                    alt={lib.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      {lib.type === "movie" ? (
                        <Film className="h-6 w-6 text-primary" />
                      ) : (
                        <Folder className="h-6 w-6 text-primary" />
                      )}
                    </div>
                  </div>
                )}

                {/* Library name overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                  <h2 className="font-bold text-white drop-shadow-lg px-4 text-center leading-tight" style={{ fontSize: 40 }}>{lib.name}</h2>
                </div>

                {/* Scanning overlay with progress */}
                {isScanning && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/60 px-6">
                    {progress ? (
                      <>
                        <Progress value={(progress.current / progress.total) * 100} className="h-1.5 w-full" />
                        <span className="text-xs text-white/80">
                          Scanning {progress.current}/{progress.total}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-white/80">Scanning...</span>
                    )}
                  </div>
                )}

                {/* Hover: three-dot menu on cover */}
                <div className="absolute inset-x-0 bottom-0 flex justify-end px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-[5]">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => { e.stopPropagation(); }}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/20 outline-none"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-48 border-white/10 bg-black/70 backdrop-blur-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuItem
                        disabled={isScanning}
                        onClick={(e) => { e.stopPropagation(); startScan(lib.id); }}
                      >
                        <HardDriveDownload className="h-4 w-4" />
                        Scan Library
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(lib); }}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteLibId(lib.id);
                          setDeleteLibName(lib.name);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Labels below cover — centered */}
              <div className="mt-2 text-center">
                <p className="truncate text-sm font-semibold text-foreground">{lib.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {lib.type === "movie" ? "Movies" : lib.type} · {lib.movieCount ?? 0}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {libraries.length === 0 && (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          No media libraries yet. Add one to get started.
        </div>
      )}

      {/* Edit library dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Library</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}
            className="flex flex-col gap-5 pt-4 overflow-hidden"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">Library Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">Folder Paths</label>
              <div className="flex flex-col gap-2">
                {editFolderPaths.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 min-w-0">
                    <input
                      type="text"
                      value={p}
                      onChange={(e) => {
                        const updated = [...editFolderPaths];
                        updated[idx] = e.target.value;
                        setEditFolderPaths(updated);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 py-2.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setEditFolderPaths(editFolderPaths.filter((_, i) => i !== idx))}
                      disabled={editFolderPaths.length <= 1}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground disabled:opacity-30"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editNewFolderPath}
                    onChange={(e) => setEditNewFolderPath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editNewFolderPath.trim()) {
                        e.preventDefault();
                        setEditFolderPaths([...editFolderPaths, editNewFolderPath.trim()]);
                        setEditNewFolderPath("");
                      }
                    }}
                    placeholder="/media/movies"
                    className="h-11 flex-1 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm font-mono text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setEditFolderPickerOpen(true)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.06] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  >
                    <Folder className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={!editNewFolderPath.trim()}
                    onClick={() => {
                      if (editNewFolderPath.trim()) {
                        setEditFolderPaths([...editFolderPaths, editNewFolderPath.trim()]);
                        setEditNewFolderPath("");
                      }
                    }}
                    className="flex h-11 items-center gap-1.5 rounded-lg border border-white/[0.06] px-3.5 text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
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
            {/* Metadata downloaders */}
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
            </div>
            {editScraperEnabled && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-muted-foreground">Metadata Language</label>
                <Select value={editMetadataLanguage} onValueChange={setEditMetadataLanguage}>
                  <SelectTrigger className="h-11 w-full rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/[0.06] bg-card">
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
                <div className="flex-1">
                  <p className="text-sm text-destructive">{editScraperError}</p>
                  <Link href="/dashboard/scraper" className="mt-1 inline-block text-sm font-medium text-primary hover:underline">
                    Go to Scraper Settings
                  </Link>
                </div>
                <button type="button" onClick={() => setEditScraperError("")} className="shrink-0 text-destructive/60 hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {/* Jellyfin Compatibility */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                Jellyfin Compatibility
              </label>
              <div className="rounded-lg border border-white/[0.06] bg-[var(--input-bg)]">
                <label className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                  <input
                    type="checkbox"
                    checked={editJellyfinCompat}
                    onChange={(e) => {
                      setEditJellyfinCompatAction(e.target.checked ? "enable" : "disable");
                      setEditJellyfinCompatConfirmOpen(true);
                    }}
                    className="h-4 w-4 rounded border-white/[0.06] bg-[var(--input-bg)] accent-primary"
                  />
                  <span className="text-sm text-foreground">Jellyfin Compatibility Mode</span>
                </label>
              </div>
              <p className="text-xs text-[#555568]">
                Prevents Kubby from writing to NFO files and imports actor photos from Jellyfin local paths.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Jellyfin compat confirmation dialog */}
      <Dialog open={editJellyfinCompatConfirmOpen} onOpenChange={setEditJellyfinCompatConfirmOpen}>
        <DialogContent className="border-white/[0.06] bg-card sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {editJellyfinCompatAction === "enable"
                ? "Enable Jellyfin Compatibility?"
                : "Disable Jellyfin Compatibility?"}
            </DialogTitle>
            <DialogDescription>
              {editJellyfinCompatAction === "enable"
                ? "When enabled, Kubby will never modify or create NFO files in your library folders. Actor photos referenced by local paths in NFO thumb tags will be copied to Kubby\u2019s metadata directory. This is recommended if Jellyfin also uses this library."
                : "Kubby will resume writing NFO files when metadata is edited or actors are supplemented during scans. Existing NFO files may be overwritten."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditJellyfinCompatConfirmOpen(false)}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setEditJellyfinCompat(editJellyfinCompatAction === "enable");
                setEditJellyfinCompatConfirmOpen(false);
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Confirm
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="border-white/[0.06] bg-card sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Library</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteLibName}&rdquo;? All movies in it will be removed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2.5 px-1 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteCleanupOrphans}
                onChange={(e) => setDeleteCleanupOrphans(e.target.checked)}
                className="h-4 w-4 rounded border-white/[0.06] bg-[var(--input-bg)] accent-primary"
              />
              <span className="text-sm text-muted-foreground">Clean up actors no longer associated with any movie</span>
            </label>
            <label className="flex items-center gap-2.5 px-1 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteNfo}
                onChange={(e) => setDeleteNfo(e.target.checked)}
                className="h-4 w-4 rounded border-white/[0.06] bg-[var(--input-bg)] accent-primary"
              />
              <span className="text-sm text-muted-foreground">Delete NFO files from media folders (allows re-scraping)</span>
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (deleteLibId) deleteLibrary.mutate({ id: deleteLibId, cleanupOrphans: deleteCleanupOrphans, deleteNfo });
                setDeleteOpen(false);
              }}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

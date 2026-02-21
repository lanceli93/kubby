"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, RefreshCw, Trash2, Folder, AlertCircle, X } from "lucide-react";
import { FolderPicker } from "@/components/library/folder-picker";
import Link from "next/link";

interface Library {
  id: string;
  name: string;
  type: string;
  folderPaths: string[];
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
  const [metadataLanguage, setMetadataLanguage] = useState("");
  const [tmdbConfigured, setTmdbConfigured] = useState<boolean | null>(null);
  const [scraperError, setScraperError] = useState("");

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
    mutationFn: () =>
      fetch("/api/libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, folderPaths, scraperEnabled, metadataLanguage: metadataLanguage || null }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      setOpen(false);
      setName("");
      setFolderPaths([]);
      setNewFolderPath("");
      setScraperEnabled(false);
      setMetadataLanguage("");
    },
  });

  const [scanningId, setScanningId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);

  const startScan = async (libId: string) => {
    if (scanningId) return;
    setScanningId(libId);
    setScanProgress(null);
    try {
      const res = await fetch(`/api/libraries/${libId}/scan`, { method: "POST" });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buffer = "";

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
          if (data.total) {
            setScanProgress({ current: data.current, total: data.total });
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
    } catch (e) {
      console.error("Scan error:", e);
    } finally {
      setScanningId(null);
      setScanProgress(null);
    }
  };

  const deleteLibrary = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/libraries/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["libraries"] }),
  });

  return (
    <div className="flex flex-col gap-6 p-8 px-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Media Libraries</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { checkTmdbKey(); setScraperError(""); } }}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" />
              Add Library
            </button>
          </DialogTrigger>
          <DialogContent className="border-white/[0.06] bg-card sm:max-w-[500px]">
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
                      <span title={p} className="min-w-0 flex-1 truncate rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 py-2.5 font-mono text-sm text-foreground">
                        {p}
                      </span>
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
                  <select
                    value={metadataLanguage}
                    onChange={(e) => setMetadataLanguage(e.target.value)}
                    className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    <option value="">English (default)</option>
                    <option value="zh-CN">简体中文</option>
                    <option value="zh-TW">繁體中文</option>
                    <option value="ja">日本語</option>
                    <option value="ko">한국어</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="es">Español</option>
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="ru">Русский</option>
                    <option value="it">Italiano</option>
                    <option value="th">ไทย</option>
                  </select>
                  <p className="text-xs text-[#555568]">
                    Language for fetching metadata from TMDB (title, overview, etc.).
                  </p>
                </div>
              )}

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

      {/* Library cards grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {libraries.map((lib) => (
          <div
            key={lib.id}
            className="flex flex-col gap-3 rounded-xl border border-white/[0.03] bg-card p-6"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                {lib.name}
              </h3>
              <span className="rounded-md bg-white/[0.04] px-2.5 py-1 text-xs capitalize text-muted-foreground">
                {lib.type}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {lib.folderPaths.map((p, idx) => (
                <p key={idx} className="font-mono text-sm text-muted-foreground">
                  {p}
                </p>
              ))}
            </div>
            <p className="text-sm text-[#666680]">
              {lib.movieCount ?? 0} movies
              {lib.lastScannedAt && ` · Last scanned: ${lib.lastScannedAt}`}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => startScan(lib.id)}
                disabled={!!scanningId}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-foreground transition-colors hover:bg-white/[0.04]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${scanningId === lib.id ? "animate-spin" : ""}`} />
                {scanningId === lib.id && scanProgress
                  ? `${scanProgress.current}/${scanProgress.total}`
                  : scanningId === lib.id
                    ? "Scanning..."
                    : "Scan Now"}
              </button>
              <button
                onClick={() => {
                  if (confirm("Delete this library?")) {
                    deleteLibrary.mutate(lib.id);
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {libraries.length === 0 && (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          No media libraries yet. Add one to get started.
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Plus, Folder, X, AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FolderPicker } from "@/components/library/folder-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTranslations } from "next-intl";
import Link from "next/link";

export function AddLibraryCard() {
  const t = useTranslations("home");
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
        body: JSON.stringify({
          name,
          type,
          folderPaths: allPaths,
          scraperEnabled,
          jellyfinCompat,
          metadataLanguage: metadataLanguage === "en" ? null : metadataLanguage,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      queryClient.invalidateQueries({ queryKey: ["movies"] });
      setOpen(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setName("");
    setFolderPaths([]);
    setNewFolderPath("");
    setScraperEnabled(false);
    setJellyfinCompat(false);
    setMetadataLanguage("en");
    setScraperError("");
  };

  return (
    <>
      {/* Card — matches LibraryCard dimensions (360×200) with dashed border */}
      <button
        onClick={() => {
          checkTmdbKey();
          setScraperError("");
          setOpen(true);
        }}
        className="group flex-shrink-0 flex flex-col items-center"
        style={{ width: 360 }}
      >
        <div
          className="flex w-full items-center justify-center rounded-[4px] border-2 border-dashed border-white/[0.12] bg-white/[0.02] transition-colors group-hover:border-primary/40 group-hover:bg-white/[0.04]"
          style={{ height: 200 }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              {t("addLibrary")}
            </span>
          </div>
        </div>
      </button>

      {/* Add Library Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t("addLibrary")}</DialogTitle>
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
                {t("libraryName")}
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
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-11 w-full rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="movie">Movie</SelectItem>
                  <SelectItem value="tvshow" disabled>TV Shows (coming soon)</SelectItem>
                  <SelectItem value="music" disabled>Music (coming soon)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("folderPaths")}
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
                    {t("addFolder")}
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
            {/* Metadata downloaders */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                Metadata downloaders (Movies)
              </label>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 py-2.5">
                <span className="text-sm text-foreground">TheMovieDb</span>
                <Switch
                  checked={scraperEnabled}
                  onCheckedChange={(checked) => {
                    if (checked && tmdbConfigured === false) {
                      setScraperError("TMDB API key is not configured. Please set it up in Dashboard > Scraper before enabling.");
                      return;
                    }
                    setScraperEnabled(checked);
                  }}
                />
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
                  <SelectContent>
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
                {t("jellyfinCompat")}
              </label>
              <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 py-2.5">
                <span className="text-sm text-foreground">{t("jellyfinCompat")}</span>
                <Switch
                  checked={jellyfinCompat}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setJellyfinCompatConfirmOpen(true);
                    } else {
                      setJellyfinCompat(false);
                    }
                  }}
                />
              </div>
              <p className="text-xs text-[#555568]">
                {t("jellyfinCompatHelp")}
              </p>
            </div>

            {/* Jellyfin compat confirmation dialog */}
            <Dialog open={jellyfinCompatConfirmOpen} onOpenChange={setJellyfinCompatConfirmOpen}>
              <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>{t("jellyfinCompatDialogTitle")}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  {t("jellyfinCompatDialogDesc")}
                </p>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setJellyfinCompatConfirmOpen(false)}
                    className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setJellyfinCompat(true);
                      setJellyfinCompatConfirmOpen(false);
                    }}
                    className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Enable
                  </button>
                </div>
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
    </>
  );
}

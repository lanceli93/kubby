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
import { Plus, RefreshCw, Trash2, Folder } from "lucide-react";
import { FolderPicker } from "@/components/library/folder-picker";

interface Library {
  id: string;
  name: string;
  type: string;
  folderPath: string;
  movieCount?: number;
  lastScannedAt?: string;
}

export default function LibrariesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [type, setType] = useState("movie");

  const { data: libraries = [] } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
  });

  const createLibrary = useMutation({
    mutationFn: () =>
      fetch("/api/libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, folderPath }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      setOpen(false);
      setName("");
      setFolderPath("");
    },
  });

  const scanLibrary = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/libraries/${id}/scan`, { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["libraries"] }),
  });

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
        <Dialog open={open} onOpenChange={setOpen}>
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
              className="flex flex-col gap-5 pt-4"
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
                  Folder Path
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    placeholder="/media/movies"
                    className="h-11 flex-1 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm font-mono text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setFolderPickerOpen(true)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.06] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  >
                    <Folder className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <FolderPicker
                open={folderPickerOpen}
                onOpenChange={setFolderPickerOpen}
                onSelect={(path) => setFolderPath(path)}
              />
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
            <p className="font-mono text-sm text-muted-foreground">
              {lib.folderPath}
            </p>
            <p className="text-sm text-[#666680]">
              {lib.movieCount ?? 0} movies
              {lib.lastScannedAt && ` · Last scanned: ${lib.lastScannedAt}`}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => scanLibrary.mutate(lib.id)}
                disabled={scanLibrary.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-foreground transition-colors hover:bg-white/[0.04]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${scanLibrary.isPending ? "animate-spin" : ""}`} />
                Scan Now
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

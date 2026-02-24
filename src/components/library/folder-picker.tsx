"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Folder, FolderOpen, ArrowUp, Loader2, HardDrive } from "lucide-react";

interface FolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
}

interface BrowseResult {
  current: string;
  parent: string | null;
  directories: { name: string; path: string }[];
  isDriveList?: boolean;
}

export function FolderPicker({ open, onOpenChange, onSelect }: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function browse(dirPath?: string) {
    setLoading(true);
    setError("");
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
      const res = await fetch(`/api/filesystem${params}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to browse");
        setLoading(false);
        return;
      }
      const result: BrowseResult = await res.json();
      setData(result);
      setCurrentPath(result.current);
    } catch {
      setError("Failed to connect");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (open) {
      browse();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.06] bg-card sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Select Folder</DialogTitle>
        </DialogHeader>

        {/* Current path display */}
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3 py-2">
          {data?.isDriveList ? (
            <HardDrive className="h-4 w-4 flex-shrink-0 text-primary" />
          ) : (
            <FolderOpen className="h-4 w-4 flex-shrink-0 text-primary" />
          )}
          <span className="truncate font-mono text-sm text-foreground">
            {currentPath || "Loading..."}
          </span>
        </div>

        {/* Directory listing */}
        <div className="h-[320px] overflow-y-auto rounded-lg border border-white/[0.06] bg-[var(--input-bg)]">
          {loading && (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex h-full items-center justify-center text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <div className="flex flex-col">
              {/* Parent directory */}
              {data.parent && (
                <button
                  onClick={() => browse(data.parent!)}
                  className="flex items-center gap-2.5 border-b border-white/[0.04] px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                >
                  <ArrowUp className="h-4 w-4" />
                  ..
                </button>
              )}

              {/* Directories */}
              {data.directories.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No subdirectories
                </div>
              )}

              {data.directories.map((dir) => (
                <button
                  key={dir.path}
                  onClick={() => browse(dir.path)}
                  className="flex items-center gap-2.5 border-b border-white/[0.04] px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-white/[0.04] last:border-b-0"
                >
                  <Folder className="h-4 w-4 flex-shrink-0 text-primary/70" />
                  <span className="truncate">{dir.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSelect(currentPath);
              onOpenChange(false);
            }}
            disabled={!currentPath || data?.isDriveList}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Select This Folder
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckSquare, X, FolderPlus, ChevronDown } from "lucide-react";
import { PhotoGrid, type PhotoItem } from "@/components/photos/photo-grid";
import { AlbumsView } from "@/components/photos/albums-view";
import { AddToAlbumDialog } from "@/components/photos/add-to-album-dialog";
import { usePhotoLibraries } from "@/hooks/use-photo-libraries";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// The photos domain shares the cinema domain's dark theme (user decision — one
// consistent Kubby look across domains). Top-level nav is a Timeline | Albums
// segmented control plus a library filter that only appears when more than one
// photo library exists. Albums are manual, user-created categories within a
// library (not auto-generated from scan folders).

type View = "timeline" | "albums";

export default function PhotosPage() {
  const t = useTranslations("photos");
  const router = useRouter();
  const photoLibraries = usePhotoLibraries();

  const [view, setView] = useState<View>("timeline");
  // null = "All libraries". Only meaningful when >1 photo library.
  const [libraryId, setLibraryId] = useState<string | null>(null);

  // Timeline selection mode (for bulk add-to-album).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadedItems, setLoadedItems] = useState<PhotoItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const showLibraryFilter = photoLibraries.length > 1;
  const activeLibrary = libraryId
    ? photoLibraries.find((l) => l.id === libraryId)
    : null;

  const openPhoto = useCallback(
    (id: string) => {
      // Carry the current library scope so the lightbox walks the same set.
      const qs = libraryId ? `?lib=${libraryId}` : "";
      router.push(`/photos/view/${id}${qs}`);
    },
    [router, libraryId],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const onItemsChange = useCallback((items: PhotoItem[]) => {
    setLoadedItems(items);
  }, []);

  // Which library the selected photos will land in. When "All" is active we
  // fall back to the sole photo library (albums require a library); with
  // multiple libraries and no filter, adding is disabled with a hint.
  const targetLibraryId = useMemo(() => {
    if (libraryId) return libraryId;
    if (photoLibraries.length === 1) return photoLibraries[0].id;
    return null;
  }, [libraryId, photoLibraries]);

  const selectedItems = useMemo(
    () => loadedItems.filter((it) => selectedIds.has(it.id)),
    [loadedItems, selectedIds],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Title bar: title + segmented control + library filter / selection */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[var(--header)] px-4 py-3 md:px-6">
        {selectionMode ? (
          <>
            <button
              type="button"
              onClick={exitSelection}
              aria-label={t("close")}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="flex-1 text-sm font-medium text-foreground">
              {t("selectedCount", { count: selectedIds.size })}
            </span>
            <button
              type="button"
              disabled={selectedIds.size === 0 || !targetLibraryId}
              onClick={() => setAddOpen(true)}
              className="focus-ring flex items-center gap-2 rounded-lg bg-primary/20 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FolderPlus className="h-4 w-4" />
              {t("addToAlbum")}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>

            {/* Segmented control */}
            <div className="ml-2 flex items-center gap-1 rounded-full bg-white/[0.04] p-1">
              <SegBtn active={view === "timeline"} onClick={() => setView("timeline")}>
                {t("timelineTab")}
              </SegBtn>
              <SegBtn active={view === "albums"} onClick={() => setView("albums")}>
                {t("albumsTab")}
              </SegBtn>
            </div>

            <div className="flex-1" />

            {/* Library filter — only with more than one photo library */}
            {showLibraryFilter && (
              <DropdownMenu>
                <DropdownMenuTrigger className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground">
                  {activeLibrary?.name ?? t("allLibraries")}
                  <ChevronDown className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 border-white/10 bg-black/70 backdrop-blur-xl"
                >
                  <DropdownMenuItem onClick={() => setLibraryId(null)} className="cursor-pointer">
                    {t("allLibraries")}
                  </DropdownMenuItem>
                  {photoLibraries.map((lib) => (
                    <DropdownMenuItem
                      key={lib.id}
                      onClick={() => setLibraryId(lib.id)}
                      className="cursor-pointer"
                    >
                      {lib.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Select mode toggle (timeline only) */}
            {view === "timeline" && (
              <button
                type="button"
                onClick={() => setSelectionMode(true)}
                aria-label={t("select")}
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <CheckSquare className="h-5 w-5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Body */}
      {view === "timeline" ? (
        <PhotoGrid
          key={libraryId ?? "all"}
          libraryId={libraryId}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onOpen={openPhoto}
          onItemsChange={onItemsChange}
        />
      ) : (
        <AlbumsView libraryId={libraryId} />
      )}

      {addOpen && targetLibraryId && (
        <AddToAlbumDialog
          libraryId={targetLibraryId}
          itemIds={selectedItems.map((it) => it.id)}
          onClose={() => setAddOpen(false)}
          onDone={() => {
            setAddOpen(false);
            exitSelection();
          }}
        />
      )}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors ${
        active
          ? "bg-primary/25 text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

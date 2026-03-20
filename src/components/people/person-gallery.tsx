"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, FolderOpen, X, ChevronLeft, ChevronRight } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";

interface GalleryImage {
  filename: string;
  path: string;
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".bmp"]);
const GALLERY_ROW_HEIGHT = 360;
const GALLERY_GAP = 6;

// ── Justified-layout sortable item ──
function JustifiedSortableItem({
  image,
  width,
  height,
  isDragActive,
  insertIndicator,
  isHighlighted,
  onClick,
  onDelete,
  deleteTitle,
}: {
  image: GalleryImage;
  width: number;
  height: number;
  isDragActive: boolean;
  insertIndicator: "left" | "right" | null;
  isHighlighted: boolean;
  onClick: () => void;
  onDelete: (filename: string) => void;
  deleteTitle: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: image.filename,
  });

  // The indicator bar sits centred in the gap between items.
  // offset = half gap + half bar width → centres the 4px bar in the 6px gap.
  const barW = GALLERY_GAP; // fill the entire gap
  const barOffset = Math.ceil(GALLERY_GAP / 2 + barW / 2); // from item edge

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="group relative flex-shrink-0 touch-none"
      style={{ width, height }}
      onClick={isDragActive ? undefined : onClick}
    >
      {/* Inner container: clips image zoom, carries highlight styles */}
      <div
        className="h-full w-full overflow-hidden"
        style={{
          opacity: isDragging ? 0.15 : 1,
          outline: isDragging
            ? "2px dashed rgba(255,255,255,0.15)"
            : isHighlighted
              ? "2px solid rgba(96,165,250,0.45)"
              : "none",
          outlineOffset: "-2px",
          filter: isHighlighted ? "brightness(1.2)" : "none",
          transition: "opacity 0.15s, outline 0.15s, filter 0.15s",
          cursor: isDragActive ? "grabbing" : "pointer",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resolveImageSrc(image.path)}
          alt={image.filename}
          className={`h-full w-full object-cover ${isDragActive ? "" : "transition-transform group-hover:scale-105"}`}
          draggable={false}
        />
        {!isDragActive && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(image.filename);
            }}
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600 cursor-pointer"
            title={deleteTitle}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Flowing insertion indicator bar */}
      {insertIndicator && (
        <div
          className="absolute top-0 bottom-0 z-10 pointer-events-none gallery-indicator-flow"
          style={{
            width: barW,
            ...(insertIndicator === "left" ? { left: -barOffset } : { right: -barOffset }),
            borderRadius: 2,
            // Base layer: subtle solid bar
            backgroundColor: "rgba(96,165,250,0.35)",
            boxShadow: "0 0 10px 2px rgba(96,165,250,0.4)",
            overflow: "hidden",
          }}
        >
          {/* Flowing light beam */}
          <div
            className="absolute inset-0 gallery-indicator-beam"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, transparent 30%, rgba(147,197,250,0.9) 45%, #c4dfff 50%, rgba(147,197,250,0.9) 55%, transparent 70%, transparent 100%)",
              backgroundSize: "100% 300%",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Main Gallery Component ──
export function PersonGallery({
  personId,
  galleryImages,
}: {
  personId: string;
  galleryImages: GalleryImage[];
}) {
  const tPerson = useTranslations("person");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const galleryContainerRef = useRef<HTMLElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [imageDims, setImageDims] = useState<Record<string, { w: number; h: number }>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overInfo, setOverInfo] = useState<{
    id: string;
    side: "left" | "right";
  } | null>(null);
  const [localOrder, setLocalOrder] = useState<string[]>([]);

  // BUG FIX: Only sync localOrder from server data when galleryImages
  // content actually changes — NOT on every activeId toggle.
  // Otherwise the useEffect resets the optimistic reorder immediately
  // after drag ends (activeId → null).
  const prevGalleryKeyRef = useRef("");
  useEffect(() => {
    const key = galleryImages.map((img) => img.filename).join("\0");
    if (key !== prevGalleryKeyRef.current) {
      prevGalleryKeyRef.current = key;
      setLocalOrder(galleryImages.map((img) => img.filename));
    }
  }, [galleryImages]);

  // Build filename→image lookup
  const imageMap = new Map(galleryImages.map((img) => [img.filename, img]));

  // Ordered images for rendering
  const orderedImages = localOrder
    .map((fn) => imageMap.get(fn))
    .filter((img): img is GalleryImage => !!img);

  // PointerSensor with 300ms delay for long-press activation
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 300, tolerance: 5 },
    })
  );

  // ── Upload (batched to stay under body size limit) ──
  const UPLOAD_BATCH_SIZE = 5;
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      return IMAGE_EXTENSIONS.has(ext);
    });
    if (imageFiles.length === 0) return;
    // Upload in batches to avoid exceeding body size limit
    for (let i = 0; i < imageFiles.length; i += UPLOAD_BATCH_SIZE) {
      const batch = imageFiles.slice(i, i + UPLOAD_BATCH_SIZE);
      const formData = new FormData();
      for (const file of batch) formData.append("file", file);
      await fetch(`/api/people/${personId}/gallery`, { method: "POST", body: formData });
    }
    queryClient.invalidateQueries({ queryKey: ["person-gallery", personId] });
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  // ── Delete ──
  const handleDeleteGalleryImage = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/people/${personId}/gallery`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: deleteTarget }),
    });
    queryClient.invalidateQueries({ queryKey: ["person-gallery", personId] });
    setDeleteTarget(null);
  };

  // ── Lightbox keyboard ──
  const handleLightboxKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight")
        setLightboxIndex((i) => (i !== null && i < orderedImages.length - 1 ? i + 1 : i));
    },
    [lightboxIndex, orderedImages.length]
  );

  useEffect(() => {
    if (lightboxIndex !== null) {
      document.addEventListener("keydown", handleLightboxKeyDown);
      return () => document.removeEventListener("keydown", handleLightboxKeyDown);
    }
  }, [lightboxIndex, handleLightboxKeyDown]);

  // ── Preload image dimensions ──
  useEffect(() => {
    galleryImages.forEach((img) => {
      if (imageDims[img.filename]) return;
      const image = new window.Image();
      image.onload = () => {
        setImageDims((prev) => ({
          ...prev,
          [img.filename]: { w: image.naturalWidth, h: image.naturalHeight },
        }));
      };
      image.src = resolveImageSrc(img.path);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryImages]);

  // ── Container width tracking ──
  const galleryRefCallback = useCallback((el: HTMLElement | null) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    galleryContainerRef.current = el;
    if (el) {
      const observer = new ResizeObserver((entries) => {
        setContainerWidth(entries[0].contentRect.width);
      });
      observer.observe(el);
      resizeObserverRef.current = observer;
    }
  }, []);

  // ── Justified layout rows ──
  const justifiedRows = (() => {
    if (containerWidth <= 0) return [];
    const rows: { filename: string; path: string; width: number; height: number }[][] = [];
    let currentRow: { filename: string; path: string; ratio: number }[] = [];
    let currentRowWidth = 0;

    for (const img of orderedImages) {
      const d = imageDims[img.filename];
      if (!d) continue;
      const ratio = d.w / d.h;
      currentRow.push({ ...img, ratio });
      currentRowWidth += ratio * GALLERY_ROW_HEIGHT + (currentRow.length > 1 ? GALLERY_GAP : 0);

      if (currentRowWidth >= containerWidth && currentRow.length > 1) {
        const totalGap = (currentRow.length - 1) * GALLERY_GAP;
        const totalRatio = currentRow.reduce((s, r) => s + r.ratio, 0);
        const rowH = (containerWidth - totalGap) / totalRatio;
        rows.push(
          currentRow.map((r) => ({
            filename: r.filename,
            path: r.path,
            width: Math.floor(r.ratio * rowH),
            height: Math.floor(rowH),
          }))
        );
        currentRow = [];
        currentRowWidth = 0;
      }
    }
    if (currentRow.length > 0) {
      const totalGap = (currentRow.length - 1) * GALLERY_GAP;
      const totalRatio = currentRow.reduce((s, r) => s + r.ratio, 0);
      const rowH = Math.min((containerWidth - totalGap) / totalRatio, GALLERY_ROW_HEIGHT);
      rows.push(
        currentRow.map((r) => ({
          filename: r.filename,
          path: r.path,
          width: Math.floor(r.ratio * rowH),
          height: Math.floor(rowH),
        }))
      );
    }
    return rows;
  })();

  // Build a lookup for justified dimensions per filename (used for DragOverlay)
  const justifiedSizeMap = new Map<string, { width: number; height: number }>();
  for (const row of justifiedRows) {
    for (const img of row) {
      justifiedSizeMap.set(img.filename, { width: img.width, height: img.height });
    }
  }

  // ── Compute highlighted neighbours of the insertion line ──
  const highlightedSet = new Set<string>();
  if (overInfo && activeId) {
    const overIdx = localOrder.indexOf(overInfo.id);
    // The item the cursor is over is always highlighted
    highlightedSet.add(overInfo.id);
    if (overInfo.side === "left") {
      // Line is on left of overItem → also highlight the previous item (if exists & not dragged)
      if (overIdx > 0) {
        const prev = localOrder[overIdx - 1];
        if (prev !== activeId) highlightedSet.add(prev);
      }
    } else {
      // Line is on right of overItem → also highlight the next item (if exists & not dragged)
      if (overIdx < localOrder.length - 1) {
        const next = localOrder[overIdx + 1];
        if (next !== activeId) highlightedSet.add(next);
      }
    }
  }

  // ── DnD handlers ──
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || over.id === active.id) {
      setOverInfo(null);
      return;
    }
    const activeIdx = localOrder.indexOf(active.id as string);
    const overIdx = localOrder.indexOf(over.id as string);
    // Dragging backward → line on left (insert before)
    // Dragging forward  → line on right (insert after)
    setOverInfo({
      id: over.id as string,
      side: activeIdx > overIdx ? "left" : "right",
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setOverInfo(null);
    if (over && active.id !== over.id) {
      setLocalOrder((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return prev;
        const next = [...prev];
        next.splice(oldIndex, 1);
        next.splice(newIndex, 0, active.id as string);
        // Fire-and-forget save
        fetch(`/api/people/${personId}/gallery`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: next }),
        });
        return next;
      });
    }
    setActiveId(null);
  };

  const handleDragCancel = () => {
    setOverInfo(null);
    setActiveId(null);
  };

  const activeImage = activeId ? imageMap.get(activeId) : null;
  const activeSize = activeId ? justifiedSizeMap.get(activeId) : null;

  return (
    <>
      {/* Keyframes for the flowing indicator animation */}
      <style>{`
        @keyframes galleryIndicatorBeam {
          0%   { background-position: 0% 200%; }
          100% { background-position: 0% -100%; }
        }
        .gallery-indicator-beam {
          animation: galleryIndicatorBeam 6s ease-in-out infinite;
        }
        .gallery-indicator-flow {
          animation: galleryIndicatorPulse 7s ease-in-out infinite;
        }
        @keyframes galleryIndicatorPulse {
          0%, 100% { box-shadow: 0 0 8px 1px rgba(96,165,250,0.35); }
          50%      { box-shadow: 0 0 14px 3px rgba(96,165,250,0.6); }
        }
      `}</style>
      <section ref={galleryRefCallback} className="flex flex-col gap-4 px-4 md:px-20 pb-12">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground">{tPerson("photos")}</h2>
          <span className="whitespace-nowrap text-sm text-[#666680]">
            ({tPerson("photosCount", { count: galleryImages.length })})
          </span>
          {galleryImages.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {tPerson("reorderPhotos")}
            </span>
          )}
          <button
            onClick={() => folderInputRef.current?.click()}
            className="ml-auto hidden md:inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <FolderOpen className="h-4 w-4" />
            {tPerson("uploadFolder")}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="ml-auto md:ml-0 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <ImagePlus className="h-4 w-4" />
            {tPerson("uploadPhotos")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        </div>

        {galleryImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tPerson("noPhotos")}</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={localOrder} strategy={rectSortingStrategy}>
              <div className="flex flex-col" style={{ gap: GALLERY_GAP }}>
                {justifiedRows.map((row, rowIdx) => (
                  <div key={rowIdx} className="flex" style={{ gap: GALLERY_GAP }}>
                    {row.map((img) => (
                      <JustifiedSortableItem
                        key={img.filename}
                        image={img}
                        width={img.width}
                        height={img.height}
                        isDragActive={activeId !== null}
                        insertIndicator={
                          overInfo?.id === img.filename ? overInfo.side : null
                        }
                        isHighlighted={highlightedSet.has(img.filename)}
                        onClick={() =>
                          setLightboxIndex(
                            orderedImages.findIndex((g) => g.filename === img.filename)
                          )
                        }
                        onDelete={setDeleteTarget}
                        deleteTitle={tPerson("deletePhoto")}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeImage && activeSize ? (
                <div
                  style={{
                    width: activeSize.width,
                    height: activeSize.height,
                  }}
                  className="overflow-hidden rounded-md shadow-[0_12px_40px_rgba(0,0,0,0.6)] ring-2 ring-white/30"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveImageSrc(activeImage.path)}
                    alt={activeImage.filename}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && orderedImages[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full text-white/70 hover:text-white cursor-pointer"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="h-6 w-6" />
          </button>
          {lightboxIndex > 0 && (
            <button
              className="absolute left-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex - 1);
              }}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {lightboxIndex < orderedImages.length - 1 && (
            <button
              className="absolute right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex + 1);
              }}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveImageSrc(orderedImages[lightboxIndex].path)}
            alt={orderedImages[lightboxIndex].filename}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Delete photo confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{tPerson("deletePhoto")}</DialogTitle>
            <DialogDescription>{tPerson("confirmDeletePhoto")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={handleDeleteGalleryImage}
              className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 cursor-pointer"
            >
              {tCommon("confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

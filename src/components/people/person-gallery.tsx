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
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface GalleryImage {
  filename: string;
  path: string;
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".bmp"]);
const GALLERY_ROW_HEIGHT = 360;
const GALLERY_GAP = 6;

// ── Sortable grid item ──
function SortableGalleryItem({
  image,
  gridSize,
  onDelete,
}: {
  image: GalleryImage;
  gridSize: number;
  onDelete: (filename: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.filename });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: gridSize,
    height: gridSize,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative overflow-hidden flex-shrink-0 touch-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolveImageSrc(image.path)}
        alt={image.filename}
        className="h-full w-full object-cover"
        draggable={false}
      />
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(image.filename);
        }}
        className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600 cursor-pointer"
      >
        <X className="h-4 w-4" />
      </button>
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
  const [isDragging, setIsDragging] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<string[]>([]);

  // Sync localOrder from galleryImages when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalOrder(galleryImages.map((img) => img.filename));
    }
  }, [galleryImages, isDragging]);

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

  // ── Upload ──
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (const file of Array.from(files)) {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      formData.append("file", file);
    }
    if (!formData.has("file")) return;
    await fetch(`/api/people/${personId}/gallery`, { method: "POST", body: formData });
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

  // ── Justified layout rows (normal mode) ──
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

  // ── Grid size for drag mode ──
  const GRID_COLS = containerWidth > 0 ? Math.max(2, Math.floor((containerWidth + GALLERY_GAP) / (200 + GALLERY_GAP))) : 4;
  const gridSize = containerWidth > 0 ? Math.floor((containerWidth - (GRID_COLS - 1) * GALLERY_GAP) / GRID_COLS) : 200;

  // ── DnD handlers ──
  const handleDragStart = (event: DragStartEvent) => {
    setIsDragging(true);
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
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
    setIsDragging(false);
    setActiveId(null);
  };

  const handleDragCancel = () => {
    setIsDragging(false);
    setActiveId(null);
  };

  const activeImage = activeId ? imageMap.get(activeId) : null;

  return (
    <>
      <section ref={galleryRefCallback} className="flex flex-col gap-4 px-20 pb-12">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground">{tPerson("photos")}</h2>
          <span className="text-sm text-[#666680]">
            ({tPerson("photosCount", { count: galleryImages.length })})
          </span>
          {galleryImages.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {tPerson("reorderPhotos")}
            </span>
          )}
          <button
            onClick={() => folderInputRef.current?.click()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <FolderOpen className="h-4 w-4" />
            {tPerson("uploadFolder")}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
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
        ) : isDragging ? (
          /* ── Grid layout during drag ── */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={localOrder} strategy={rectSortingStrategy}>
              <div
                className="flex flex-wrap"
                style={{ gap: GALLERY_GAP }}
              >
                {orderedImages.map((img) => (
                  <SortableGalleryItem
                    key={img.filename}
                    image={img}
                    gridSize={gridSize}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeImage ? (
                <div
                  style={{ width: gridSize, height: gridSize }}
                  className="overflow-hidden opacity-80 shadow-2xl ring-2 ring-primary"
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
        ) : (
          /* ── Normal justified layout with DndContext for long-press activation ── */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
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
        <DialogContent className="border-white/[0.06] bg-card sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{tPerson("deletePhoto")}</DialogTitle>
            <DialogDescription>{tPerson("confirmDeletePhoto")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={handleDeleteGalleryImage}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
            >
              {tCommon("confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Justified-layout sortable wrapper ──
// In normal (justified) mode each item still participates in DndContext
// so a long-press can activate drag. Once drag starts the parent switches
// to the grid layout.
function JustifiedSortableItem({
  image,
  width,
  height,
  onClick,
  onDelete,
  deleteTitle,
}: {
  image: GalleryImage;
  width: number;
  height: number;
  onClick: () => void;
  onDelete: (filename: string) => void;
  deleteTitle: string;
}) {
  const { attributes, listeners, setNodeRef } = useSortable({
    id: image.filename,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="group relative cursor-pointer overflow-hidden flex-shrink-0 touch-none"
      style={{ width, height }}
      onClick={onClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolveImageSrc(image.path)}
        alt={image.filename}
        className="h-full w-full object-cover transition-transform group-hover:scale-105"
        draggable={false}
      />
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
    </div>
  );
}

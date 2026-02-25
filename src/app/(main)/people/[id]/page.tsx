"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { MoreVertical, Pencil, ImageIcon, ExternalLink, Star, ImagePlus, FolderOpen, X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import Link from "next/link";
import { MovieCard } from "@/components/movie/movie-card";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { PersonMetadataEditor } from "@/components/people/person-metadata-editor";
import { ImageEditorDialog } from "@/components/shared/image-editor-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { StarRatingDialog } from "@/components/movie/star-rating-dialog";
import { getTier, getTierColor, getTierBorderColor, getTierGlow } from "@/lib/tier";
import { useUserPreferences } from "@/hooks/use-user-preferences";

interface PersonDetail {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
  fanartPath?: string | null;
  fanartSource?: "own" | "movie" | null;
  overview?: string | null;
  birthDate?: string | null;
  birthYear?: number | null;
  placeOfBirth?: string | null;
  deathDate?: string | null;
  tmdbId?: string | null;
  imdbId?: string | null;
  userData?: {
    personalRating?: number | null;
    dimensionRatings?: Record<string, number> | null;
  };
  movies: {
    id: string;
    title: string;
    year?: number;
    posterPath?: string | null;
    communityRating?: number | null;
    personalRating?: number | null;
    videoWidth?: number | null;
    videoHeight?: number | null;
    role?: string;
  }[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function PersonDetailPage() {
  const params = useParams();
  const personId = params.id as string;
  const t = useTranslations("movies");
  const tPerson = useTranslations("person");
  const tMeta = useTranslations("metadata");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const { data: prefs } = useUserPreferences();
  const personDimensions = prefs?.personRatingDimensions ?? [];

  const [fanartMode, setFanartMode] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const galleryContainerRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [imageDims, setImageDims] = useState<Record<string, { w: number; h: number }>>({});
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const { data: person } = useQuery<PersonDetail>({
    queryKey: ["person", personId],
    queryFn: () => fetch(`/api/people/${personId}`).then((r) => r.json()),
  });

  const { data: galleryData } = useQuery<{ images: { filename: string; path: string }[] }>({
    queryKey: ["person-gallery", personId],
    queryFn: () => fetch(`/api/people/${personId}/gallery`).then((r) => r.json()),
  });
  const galleryImages = galleryData?.images ?? [];

  const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".bmp"]);

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

  const handleLightboxKeyDown = useCallback((e: KeyboardEvent) => {
    if (lightboxIndex === null) return;
    if (e.key === "Escape") setLightboxIndex(null);
    if (e.key === "ArrowLeft") setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
    if (e.key === "ArrowRight") setLightboxIndex((i) => (i !== null && i < galleryImages.length - 1 ? i + 1 : i));
  }, [lightboxIndex, galleryImages.length]);

  useEffect(() => {
    if (lightboxIndex !== null) {
      document.addEventListener("keydown", handleLightboxKeyDown);
      return () => document.removeEventListener("keydown", handleLightboxKeyDown);
    }
  }, [lightboxIndex, handleLightboxKeyDown]);

  // Preload gallery image dimensions
  useEffect(() => {
    galleryImages.forEach((img) => {
      if (imageDims[img.filename]) return;
      const image = new window.Image();
      image.onload = () => {
        setImageDims((prev) => ({ ...prev, [img.filename]: { w: image.naturalWidth, h: image.naturalHeight } }));
      };
      image.src = resolveImageSrc(img.path);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryImages]);

  // Track gallery container width via callback ref
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

  const GALLERY_ROW_HEIGHT = 360;
  const GALLERY_GAP = 6;

  const justifiedRows = (() => {
    if (containerWidth <= 0) return [];
    const rows: { filename: string; path: string; width: number; height: number }[][] = [];
    let currentRow: { filename: string; path: string; ratio: number }[] = [];
    let currentRowWidth = 0;

    for (const img of galleryImages) {
      const d = imageDims[img.filename];
      if (!d) continue;
      const ratio = d.w / d.h;
      currentRow.push({ ...img, ratio });
      currentRowWidth += ratio * GALLERY_ROW_HEIGHT + (currentRow.length > 1 ? GALLERY_GAP : 0);

      if (currentRowWidth >= containerWidth && currentRow.length > 1) {
        const totalGap = (currentRow.length - 1) * GALLERY_GAP;
        const totalRatio = currentRow.reduce((s, r) => s + r.ratio, 0);
        const rowH = (containerWidth - totalGap) / totalRatio;
        rows.push(currentRow.map((r) => ({
          filename: r.filename, path: r.path,
          width: Math.floor(r.ratio * rowH), height: Math.floor(rowH),
        })));
        currentRow = [];
        currentRowWidth = 0;
      }
    }
    // Last row — cap at target height so it doesn't stretch
    if (currentRow.length > 0) {
      const totalGap = (currentRow.length - 1) * GALLERY_GAP;
      const totalRatio = currentRow.reduce((s, r) => s + r.ratio, 0);
      const rowH = Math.min((containerWidth - totalGap) / totalRatio, GALLERY_ROW_HEIGHT);
      rows.push(currentRow.map((r) => ({
        filename: r.filename, path: r.path,
        width: Math.floor(r.ratio * rowH), height: Math.floor(rowH),
      })));
    }
    return rows;
  })();

  const savePersonalRating = async (rating: number | null, dimensionRatings?: Record<string, number> | null) => {
    await fetch(`/api/people/${personId}/user-data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personalRating: rating, dimensionRatings }),
    });
    queryClient.invalidateQueries({ queryKey: ["person", personId] });
  };

  if (!person) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-scroll">
    <div className="flex flex-col">
      {/* Hero Section with Fanart — matches movie detail layout */}
      <div className="relative min-h-[750px] w-full overflow-hidden">
        {/* Fanart Background */}
        {person.fanartPath && (
          <Image
            src={resolveImageSrc(person.fanartPath)}
            alt=""
            fill
            className="object-cover"
            priority
          />
        )}

        {/* Fanart fullscreen click-to-dismiss overlay */}
        {fanartMode && (
          <div
            className="absolute inset-0 z-20 cursor-pointer"
            onClick={() => setFanartMode(false)}
          />
        )}


        {/* Bottom gradient — fade to page background */}
        <div className={`absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background transition-opacity duration-300 ${fanartMode ? "opacity-0 pointer-events-none" : ""}`} />
        {/* Left-to-right gradient — dark behind text, fanart peeks through on right */}
        <div className={`absolute inset-0 bg-gradient-to-r from-background via-background/60 to-background/20 transition-opacity duration-300 ${fanartMode ? "opacity-0 pointer-events-none" : ""}`} />

        {/* Content row: poster + person info */}
        <div className={`absolute inset-x-0 bottom-0 flex gap-8 px-20 pb-16 transition-opacity duration-300 ${fanartMode ? "opacity-0 pointer-events-none" : ""}`}>
          {/* Poster — 350×525 (2:3), same as movie detail */}
          <div className="relative h-[525px] w-[350px] flex-shrink-0 overflow-hidden rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {person.photoPath ? (
              <Image
                src={resolveImageSrc(person.photoPath)}
                alt={person.name}
                fill
                className="object-cover"
                sizes="350px"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[var(--surface)] text-4xl text-muted-foreground">
                {person.name[0]?.toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 py-2 [text-shadow:0_1px_8px_rgba(0,0,0,0.8)]">
            <h1 className="text-4xl font-bold text-white">
              {person.name}
            </h1>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 items-center rounded-md border border-white/20 px-3 text-sm capitalize text-white/70">
                {person.type}
              </span>

              {/* Personal rating + tier */}
              {person.userData?.personalRating != null && person.userData.personalRating > 0 ? (
                <>
                  <button
                    onClick={() => setRatingOpen(true)}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--gold)]/30 px-2.5 text-sm font-semibold text-[var(--gold)] transition-opacity hover:opacity-80 cursor-pointer"
                  >
                    <Star className="h-3.5 w-3.5 fill-[var(--gold)]" />
                    {person.userData.personalRating.toFixed(1)}
                  </button>
                  <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-sm font-black tracking-wider ${getTierColor(getTier(person.userData.personalRating))} ${getTierBorderColor(getTier(person.userData.personalRating))} ${getTierGlow(getTier(person.userData.personalRating))}`}>
                    {getTier(person.userData.personalRating)}
                  </span>
                </>
              ) : (
                <button
                  onClick={() => setRatingOpen(true)}
                  className="inline-flex h-7 items-center justify-center rounded-md border border-white/20 px-2 text-white/40 transition-colors hover:text-[var(--gold)] cursor-pointer"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}

              {/* View fanart button */}
              {person.fanartPath && (
                <button
                  onClick={() => setFanartMode(true)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 text-white/70 transition-colors hover:bg-white/10"
                  title="View fanart"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Three-dot menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="inline-flex h-7 items-center justify-center rounded-md border border-white/20 px-2 text-white/70 transition-colors hover:bg-white/10"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-48 border-white/10 bg-black/70 backdrop-blur-xl"
                >
                  <DropdownMenuItem onClick={() => setMetadataOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    {t("editMetadata")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setImageEditorOpen(true)}>
                    <ImageIcon className="h-4 w-4" />
                    {tMeta("editImages")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Overview / Biography */}
            {person.overview && (
              <p className="max-w-[80%] text-[15px] leading-relaxed text-white/80 line-clamp-5">
                {person.overview}
              </p>
            )}

            {/* Metadata list */}
            <div className="flex flex-col gap-1.5 pt-1 text-sm max-w-[80%]">
              {(person.birthDate || person.birthYear) && (
                <div>
                  <span className="text-white/50">{tPerson("born")}: </span>
                  <span className="text-white/90">
                    {person.birthDate ? formatDate(person.birthDate) : person.birthYear}
                  </span>
                </div>
              )}
              {person.deathDate && (
                <div>
                  <span className="text-white/50">{tPerson("died")}: </span>
                  <span className="text-white/90">
                    {formatDate(person.deathDate)}
                  </span>
                </div>
              )}
              {person.placeOfBirth && (
                <div>
                  <span className="text-white/50">{tPerson("birthPlace")}: </span>
                  <span className="text-white/90">{person.placeOfBirth}</span>
                </div>
              )}
            </div>

            {/* External links */}
            {(person.imdbId || person.tmdbId) && (
              <div className="flex items-center gap-3 pt-1">
                {person.imdbId && (
                  <a
                    href={`https://www.imdb.com/name/${person.imdbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-[var(--gold)] hover:underline"
                  >
                    IMDb <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {person.tmdbId && (
                  <a
                    href={`https://www.themoviedb.org/person/${person.tmdbId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-sky-400 hover:underline"
                  >
                    TMDB <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filmography */}
      <section className="flex flex-col gap-4 px-20 mt-[10px] pb-12">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground">
            {tPerson("filmography")}
          </h2>
          <span className="text-sm text-[#666680]">
            ({tPerson("moviesCount", { count: person.movies.length })})
          </span>
          <Link
            href={`/movies?personId=${personId}`}
            className="ml-auto text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {tPerson("viewAll")} →
          </Link>
        </div>

        <div className="flex gap-4 overflow-hidden">
          {person.movies.map((movie) => (
            <div key={movie.id} className="flex-shrink-0" style={{ width: 180 }}>
              <MovieCard
                id={movie.id}
                title={movie.title}
                year={movie.year}
                posterPath={movie.posterPath}
                rating={movie.communityRating}
                personalRating={movie.personalRating}
                videoWidth={movie.videoWidth}
                videoHeight={movie.videoHeight}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Photo Gallery */}
      <section ref={galleryRefCallback} className="flex flex-col gap-4 px-20 pb-12">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground">
            {tPerson("photos")}
          </h2>
          <span className="text-sm text-[#666680]">
            ({tPerson("photosCount", { count: galleryImages.length })})
          </span>
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
            {...{ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>}
          />
        </div>

        {galleryImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tPerson("noPhotos")}</p>
        ) : (
          <div className="flex flex-col" style={{ gap: GALLERY_GAP }}>
            {justifiedRows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex" style={{ gap: GALLERY_GAP }}>
                {row.map((img) => (
                  <div
                    key={img.filename}
                    className="group relative cursor-pointer overflow-hidden flex-shrink-0"
                    style={{ width: img.width, height: img.height }}
                    onClick={() => setLightboxIndex(galleryImages.findIndex((g) => g.filename === img.filename))}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveImageSrc(img.path)}
                      alt={img.filename}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(img.filename);
                      }}
                      className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600 cursor-pointer"
                      title={tPerson("deletePhoto")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && galleryImages[lightboxIndex] && (
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
          {lightboxIndex < galleryImages.length - 1 && (
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
            src={resolveImageSrc(galleryImages[lightboxIndex].path)}
            alt={galleryImages[lightboxIndex].filename}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Delete photo confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
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

      {/* Metadata editor dialog */}
      <PersonMetadataEditor
        personId={personId}
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
      />

      {/* Image editor dialog */}
      <ImageEditorDialog
        open={imageEditorOpen}
        onOpenChange={setImageEditorOpen}
        entityType="person"
        entityId={personId}
        entityName={person.name}
      />

      {/* Personal rating dialog */}
      <StarRatingDialog
        open={ratingOpen}
        onOpenChange={setRatingOpen}
        value={person.userData?.personalRating ?? null}
        onSave={savePersonalRating}
        dimensions={personDimensions}
        dimensionRatings={person.userData?.dimensionRatings}
        showTier
      />
    </div>
    </div>
  );
}

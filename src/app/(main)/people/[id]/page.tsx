"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { MoreVertical, Pencil, ImageIcon, ExternalLink, Star, Maximize2, Trash2 } from "lucide-react";
import Link from "next/link";
import { MovieCard } from "@/components/movie/movie-card";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PersonMetadataEditor } from "@/components/people/person-metadata-editor";
import { PersonGallery } from "@/components/people/person-gallery";
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
    ageAtRelease?: number | null;
  }[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function PersonDetailPage() {
  const params = useParams();
  const router = useRouter();
  const personId = params.id as string;
  const t = useTranslations("movies");
  const tPerson = useTranslations("person");
  const tMeta = useTranslations("metadata");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [deletePersonOpen, setDeletePersonOpen] = useState(false);
  const [deletePersonFiles, setDeletePersonFiles] = useState(false);
  const { data: prefs } = useUserPreferences();
  const personDimensions = prefs?.personRatingDimensions ?? [];

  const [fanartMode, setFanartMode] = useState(false);

  const { data: person } = useQuery<PersonDetail>({
    queryKey: ["person", personId],
    queryFn: () => fetch(`/api/people/${personId}`).then((r) => r.json()),
  });

  const { data: galleryData } = useQuery<{ images: { filename: string; path: string }[] }>({
    queryKey: ["person-gallery", personId],
    queryFn: () => fetch(`/api/people/${personId}/gallery`).then((r) => r.json()),
  });
  const galleryImages = galleryData?.images ?? [];


  const deletePerson = useMutation({
    mutationFn: (opts?: { deleteFiles?: boolean }) =>
      fetch(`/api/people/${personId}${opts?.deleteFiles ? "?deleteFiles=true" : ""}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["movies"] });
      router.push("/");
    },
  });

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
    <div className="h-full overflow-y-scroll scrollbar-hide">
    <div className="flex flex-col">
      {/* Hero Section with Fanart — matches movie detail layout */}
      <div className="relative md:min-h-[750px] w-full overflow-hidden">
        {/* Fanart Background */}
        {person.fanartPath && (
          <div className="relative h-[220px] w-full md:absolute md:inset-0 md:h-auto">
            <Image
              src={resolveImageSrc(person.fanartPath)}
              alt=""
              fill
              className="object-cover"
              priority
            />
          </div>
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
        <div className={`hidden md:block absolute inset-0 bg-gradient-to-r from-background via-background/60 to-background/20 transition-opacity duration-300 ${fanartMode ? "opacity-0 pointer-events-none" : ""}`} />

        {/* Content row: poster + person info */}
        <div className={`animate-fade-in-up relative md:absolute md:inset-x-0 md:bottom-0 flex gap-8 px-4 md:px-20 pb-6 md:pb-16 transition-opacity duration-300 ${fanartMode ? "opacity-0 pointer-events-none" : ""}`}>
          {/* Poster — 350×525 (2:3), same as movie detail */}
          <div className="hidden md:block relative h-[525px] w-[350px] flex-shrink-0 overflow-hidden rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
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
            <h1 className="text-2xl md:text-4xl font-bold text-white">
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
                  className="hidden md:inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 text-white/70 transition-colors hover:bg-white/10"
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => setDeletePersonOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                    {tPerson("deletePerson")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Overview / Biography */}
            {person.overview && (
              <p className="max-w-full md:max-w-[80%] text-[15px] leading-relaxed text-white/80 line-clamp-5">
                {person.overview}
              </p>
            )}

            {/* Metadata list */}
            <div className="flex flex-col gap-1.5 pt-1 text-sm max-w-full md:max-w-[80%]">
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

      <div className="stagger-children">
      {/* Filmography */}
      <section className="flex flex-col gap-4 px-4 md:px-20 mt-[10px] pb-12">
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

        <div className="flex gap-4 overflow-hidden pb-0.5">
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
                subtitle={movie.ageAtRelease != null ? tPerson("filmedAtAge", { age: movie.ageAtRelease }) : undefined}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Photo Gallery */}
      <PersonGallery personId={personId} galleryImages={galleryImages} />
      </div>

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

      {/* Delete person confirmation dialog */}
      <Dialog open={deletePersonOpen} onOpenChange={(open) => { setDeletePersonOpen(open); if (!open) setDeletePersonFiles(false); }}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{tPerson("deletePerson")}</DialogTitle>
            <DialogDescription>{tPerson("confirmDeletePerson")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 px-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deletePersonFiles}
                onChange={(e) => setDeletePersonFiles(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 accent-destructive"
              />
              <span className="text-sm text-foreground">{tPerson("deleteLocalFiles")}</span>
            </label>
            {deletePersonFiles && (
              <p className="text-xs text-destructive pl-6">{tPerson("deleteLocalFilesWarning")}</p>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setDeletePersonOpen(false)}
              className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={() => {
                deletePerson.mutate({ deleteFiles: deletePersonFiles });
                setDeletePersonOpen(false);
                setDeletePersonFiles(false);
              }}
              className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 cursor-pointer"
            >
              {tCommon("confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { MoreVertical, Pencil, ExternalLink, Star } from "lucide-react";
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
import { StarRatingDialog } from "@/components/movie/star-rating-dialog";
import { getTier, getTierColor, getTierBorderColor, getTierGlow } from "@/lib/tier";

interface PersonDetail {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
  fanartPath?: string | null;
  overview?: string | null;
  birthDate?: string | null;
  birthYear?: number | null;
  placeOfBirth?: string | null;
  deathDate?: string | null;
  tmdbId?: string | null;
  imdbId?: string | null;
  userData?: {
    personalRating?: number | null;
  };
  movies: {
    id: string;
    title: string;
    year?: number;
    posterPath?: string | null;
    communityRating?: number | null;
    personalRating?: number | null;
    role?: string;
  }[];
}

function computeAge(birthDate: string, deathDate?: string | null): number | null {
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  const end = deathDate ? new Date(deathDate) : new Date();
  if (isNaN(end.getTime())) return null;
  let age = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
    age--;
  }
  return age;
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
  const queryClient = useQueryClient();
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);

  const { data: person } = useQuery<PersonDetail>({
    queryKey: ["person", personId],
    queryFn: () => fetch(`/api/people/${personId}`).then((r) => r.json()),
  });

  const savePersonalRating = async (rating: number | null) => {
    await fetch(`/api/people/${personId}/user-data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personalRating: rating }),
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

        {/* Bottom gradient — fade to page background */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
        {/* Left-to-right gradient — dark behind text, fanart peeks through on right */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-background/20" />

        {/* Content row: poster + person info */}
        <div className="absolute inset-x-0 bottom-0 flex gap-8 px-20 pb-16">
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
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Overview / Biography */}
            {person.overview && (
              <p className="max-w-[700px] text-[15px] leading-relaxed text-white/80">
                {person.overview}
              </p>
            )}

            {/* Metadata list */}
            <div className="flex flex-col gap-1.5 pt-1 text-sm">
              {person.birthDate && (
                <div>
                  <span className="text-white/50">{tPerson("born")}: </span>
                  <span className="text-white/90">
                    {formatDate(person.birthDate)}
                    {(() => {
                      const age = computeAge(person.birthDate!, person.deathDate);
                      return age != null && !person.deathDate
                        ? ` (${tPerson("ageYearsOld", { age })})`
                        : "";
                    })()}
                  </span>
                </div>
              )}
              {person.deathDate && (
                <div>
                  <span className="text-white/50">{tPerson("died")}: </span>
                  <span className="text-white/90">
                    {formatDate(person.deathDate)}
                    {(() => {
                      const age = person.birthDate ? computeAge(person.birthDate, person.deathDate) : null;
                      return age != null ? ` (${tPerson("agedYears", { age })})` : "";
                    })()}
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
            Filmography
          </h2>
          <span className="text-sm text-[#666680]">
            ({person.movies.length} movies)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {person.movies.map((movie) => (
            <div key={movie.id} className="flex flex-col gap-1">
              <MovieCard
                id={movie.id}
                title={movie.title}
                year={movie.year}
                posterPath={movie.posterPath}
                rating={movie.communityRating}
                personalRating={movie.personalRating}
              />
              {movie.role && (
                <p className="truncate px-1 text-xs text-muted-foreground">
                  as {movie.role}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Metadata editor dialog */}
      <PersonMetadataEditor
        personId={personId}
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
      />

      {/* Personal rating dialog */}
      <StarRatingDialog
        open={ratingOpen}
        onOpenChange={setRatingOpen}
        value={person.userData?.personalRating ?? null}
        onSave={savePersonalRating}
      />
    </div>
  );
}

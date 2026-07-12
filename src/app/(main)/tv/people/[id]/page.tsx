"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { ExternalLink, Tv } from "lucide-react";
import { ShowCard } from "@/components/tv/show-card";
import { resolveImageSrc } from "@/lib/image-utils";
import { useTranslations } from "next-intl";

// Isolated TV-domain person page. TV people live in tv_people and are read-only
// (no user-data / gallery / metadata editor exists for them), so this is a
// slimmed-down cousin of the cinema /people/[id] page: hero (fanart + photo +
// bio) plus the shows the person appears in, linking back into the TV domain.
interface TvPersonShow {
  id: string;
  title: string;
  year?: number | null;
  role?: string | null;
  posterPath?: string | null;
  posterBlur?: string | null;
}

interface TvPersonDetail {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
  photoBlur?: string | null;
  fanartPath?: string | null;
  overview?: string | null;
  birthDate?: string | null;
  birthYear?: number | null;
  placeOfBirth?: string | null;
  deathDate?: string | null;
  tmdbId?: string | null;
  imdbId?: string | null;
  shows: TvPersonShow[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function TvPersonDetailPage() {
  const params = useParams();
  const personId = params.id as string;
  const tPerson = useTranslations("person");
  const tMovies = useTranslations("movies");

  const [fanartError, setFanartError] = useState(false);
  const [photoError, setPhotoError] = useState(false);

  const { data: person, isLoading } = useQuery<TvPersonDetail>({
    queryKey: ["tv-person", personId],
    queryFn: () => fetch(`/api/tv/people/${personId}`).then((r) => r.json()),
  });

  // Guard against both the loading window and a not-found/error response —
  // the API returns { error } (no `name`) for a missing person, so require a
  // real name before rendering to avoid a `person.name[0]` crash.
  if (isLoading || !person || !person.name) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-scroll scrollbar-hide animate-fade-in">
      <div className="flex flex-col">
        {/* Hero Section with Fanart */}
        <div className="relative md:min-h-[750px] w-full overflow-hidden">
          {person.fanartPath && !fanartError && (
            <div className="relative h-[220px] w-full md:absolute md:inset-0 md:h-auto">
              <Image
                src={resolveImageSrc(person.fanartPath)}
                alt=""
                fill
                className="object-cover"
                priority
                onError={() => setFanartError(true)}
              />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
          <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-background/60 via-background/30 to-transparent" />

          <div className="relative md:absolute md:inset-x-0 md:bottom-0 flex gap-8 pt-3 md:pt-0 px-4 pb-6 md:px-20 md:pb-24">
            {/* Poster — 350×525 (2:3) */}
            <div className="hidden md:block relative h-[525px] w-[350px] flex-shrink-0 overflow-hidden rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
              {person.photoPath && !photoError ? (
                <Image
                  src={resolveImageSrc(person.photoPath)}
                  alt={person.name}
                  fill
                  className="object-cover"
                  sizes="350px"
                  onError={() => setPhotoError(true)}
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-white/[0.05] text-4xl text-muted-foreground">
                  {person.name[0]?.toUpperCase()}
                </div>
              )}
            </div>

            <div className="backdrop-blur-[20px] bg-[rgba(10,10,15,0.45)] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_0.5px_0_rgba(255,255,255,0.1)] flex min-w-0 flex-1 flex-col gap-3 rounded-2xl p-4 md:p-6">
              <h1 className="text-2xl md:text-3xl font-bold text-white">{person.name}</h1>
              <div className="flex items-center gap-2">
                <span className="glass-badge inline-flex h-7 items-center rounded-md px-3 text-sm capitalize text-white/90">
                  {person.type}
                </span>
              </div>

              {person.overview && (
                <p className="max-w-full md:max-w-[80%] text-[15px] leading-relaxed text-white/80 line-clamp-5">
                  {person.overview}
                </p>
              )}

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
                    <span className="text-white/90">{formatDate(person.deathDate)}</span>
                  </div>
                )}
                {person.placeOfBirth && (
                  <div>
                    <span className="text-white/50">{tPerson("birthPlace")}: </span>
                    <span className="text-white/90">{person.placeOfBirth}</span>
                  </div>
                )}
              </div>

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

        {/* Shows (TV filmography) */}
        <section className="flex flex-col gap-4 px-4 md:px-20 mt-[10px] pb-12">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">{tMovies("cast")}</h2>
            <span className="text-sm text-[#666680]">({person.shows.length})</span>
          </div>

          {person.shows.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {person.shows.map((show) => (
                <ShowCard
                  key={show.id}
                  id={show.id}
                  title={show.title}
                  year={show.year}
                  posterPath={show.posterPath}
                  posterBlur={show.posterBlur}
                  subtitle={show.role ?? undefined}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
              <Tv className="h-5 w-5" /> {tMovies("cast")}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

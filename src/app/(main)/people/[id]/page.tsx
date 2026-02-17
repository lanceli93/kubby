"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { MovieCard } from "@/components/movie/movie-card";
import { resolveImageSrc } from "@/lib/image-utils";

interface PersonDetail {
  id: string;
  name: string;
  type: string;
  photoPath?: string | null;
  fanartPath?: string | null;
  movies: {
    id: string;
    title: string;
    year?: number;
    posterPath?: string | null;
    communityRating?: number | null;
    role?: string;
  }[];
}

export default function PersonDetailPage() {
  const params = useParams();
  const personId = params.id as string;

  const { data: person } = useQuery<PersonDetail>({
    queryKey: ["person", personId],
    queryFn: () => fetch(`/api/people/${personId}`).then((r) => r.json()),
  });

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
      <div className="relative min-h-[650px] w-full overflow-hidden">
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
        <div className="absolute inset-x-0 bottom-0 flex gap-8 px-20 pb-10">
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
            <span className="inline-flex w-fit rounded-md border border-white/20 px-3 py-1 text-sm capitalize text-white/70">
              {person.type}
            </span>
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
    </div>
  );
}

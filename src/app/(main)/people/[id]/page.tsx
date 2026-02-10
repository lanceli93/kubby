"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { MovieCard } from "@/components/movie/movie-card";

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
      {/* Hero section with fanart gradient */}
      <div className="relative h-[440px] w-full overflow-hidden">
        {/* Fanart background (use first movie's fanart if available) */}
        {person.fanartPath && (
          <Image
            src={`/api/images/${encodeURIComponent(person.fanartPath)}`}
            alt=""
            fill
            className="object-cover"
          />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />

        {/* Person info */}
        <div className="absolute inset-x-0 top-10 flex items-center gap-6 px-20">
          {/* Person card - large */}
          <div className="relative h-[340px] w-60 flex-shrink-0 overflow-hidden rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {person.photoPath ? (
              <Image
                src={`/api/images/${encodeURIComponent(person.photoPath)}`}
                alt={person.name}
                fill
                className="object-cover"
                sizes="240px"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[var(--surface)] text-4xl text-muted-foreground">
                {person.name[0]?.toUpperCase()}
              </div>
            )}
            {/* Bottom gradient */}
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
              <p className="text-lg font-semibold text-white">{person.name}</p>
              <p className="text-sm capitalize text-[#8888a0]">
                {person.type}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-foreground">
              {person.name}
            </h1>
            <span className="inline-flex w-fit rounded-md border border-white/[0.1] px-3 py-1 text-sm capitalize text-muted-foreground">
              {person.type}
            </span>
          </div>
        </div>
      </div>

      {/* Filmography */}
      <section className="flex flex-col gap-4 px-20 pb-12">
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

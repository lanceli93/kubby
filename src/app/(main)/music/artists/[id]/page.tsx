"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { UserRound, ArrowLeft } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { AlbumCard } from "@/components/music/album-card";
import { useTranslations } from "next-intl";

interface ArtistAlbum {
  id: string;
  title: string;
  year?: number | null;
  coverPath?: string | null;
  coverBlur?: string | null;
  trackCount?: number;
}

interface ArtistDetail {
  id: string;
  name: string;
  imagePath?: string | null;
  imageBlur?: string | null;
  overview?: string | null;
  albums: ArtistAlbum[];
}

export default function ArtistDetailPage() {
  const params = useParams();
  const artistId = params.id as string;
  const t = useTranslations("music");

  const { data: artist, isLoading } = useQuery<ArtistDetail>({
    queryKey: ["music-artist", artistId],
    queryFn: () => fetch(`/api/music/artists/${artistId}`).then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        {t("title")}…
      </div>
    );
  }

  if (!artist || !artist.id) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-scroll px-4 md:px-12">
      <div className="animate-fade-in-up mx-auto max-w-5xl py-6">
        {/* Back link */}
        <Link
          href="/music?tab=artists"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("artists")}
        </Link>

        {/* Header: circular image + name + overview + album count */}
        <div className="flex flex-col items-center gap-5 text-center md:flex-row md:items-center md:text-left">
          {/* Circular image with ambient glow */}
          <div className="relative h-[160px] w-[160px] flex-shrink-0">
            {artist.imageBlur && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 scale-110 rounded-full bg-cover bg-center opacity-45 blur-[28px] saturate-[1.4]"
                style={{ backgroundImage: `url(${artist.imageBlur})` }}
              />
            )}
            <div className="relative h-full w-full overflow-hidden rounded-full bg-[var(--surface)] shadow-[0_8px_32px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
              {artist.imagePath ? (
                <Image
                  src={resolveImageSrc(artist.imagePath, 320)}
                  alt={artist.name}
                  fill
                  className="object-cover"
                  sizes="160px"
                  priority
                  {...(artist.imageBlur ? { placeholder: "blur" as const, blurDataURL: artist.imageBlur } : {})}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <UserRound className="h-12 w-12" />
                </div>
              )}
            </div>
          </div>

          {/* Name + meta */}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <h1 className="text-3xl font-bold text-foreground md:text-4xl">{artist.name}</h1>
            <p className="text-sm text-muted-foreground">
              {t("albumCount", { count: artist.albums.length })}
            </p>
            {artist.overview && (
              <p className="max-w-full text-[15px] leading-relaxed text-white/80 line-clamp-4 md:max-w-[80%]">
                {artist.overview}
              </p>
            )}
          </div>
        </div>

        {/* Album grid */}
        <div className="mt-8">
          <h2 className="mb-4 text-xl font-semibold text-foreground">{t("albums")}</h2>
          {artist.albums.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-[repeat(auto-fill,180px)] md:gap-x-4 md:gap-y-6 justify-center">
              {artist.albums.map((album, index) => (
                <AlbumCard
                  key={album.id}
                  id={album.id}
                  title={album.title}
                  coverPath={album.coverPath}
                  coverBlur={album.coverBlur}
                  year={album.year}
                  responsive
                  priority={index < 10}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {t("empty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

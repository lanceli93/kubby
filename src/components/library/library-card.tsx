"use client";

import Link from "next/link";
import { Film, Folder } from "lucide-react";
import { useTranslations } from "next-intl";

interface LibraryCardProps {
  id: string;
  name: string;
  type: string;
  movieCount?: number;
}

export function LibraryCard({ id, name, type, movieCount }: LibraryCardProps) {
  const t = useTranslations("movies");

  return (
    <Link
      href={`/movies?libraryId=${id}`}
      className="group relative flex-shrink-0 overflow-hidden rounded-lg transition-transform hover:scale-[1.02]"
      style={{ width: 320, height: 180 }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--surface)] transition-colors group-hover:bg-[#1f1f38]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          {type === "movie" ? (
            <Film className="h-6 w-6 text-primary" />
          ) : (
            <Folder className="h-6 w-6 text-primary" />
          )}
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-foreground">{name}</p>
          {movieCount != null && (
            <p className="text-xs text-muted-foreground">
              {t("moviesCount", { count: movieCount })}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

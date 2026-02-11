import Link from "next/link";
import Image from "next/image";
import { Star, Heart } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";

interface MovieCardProps {
  id: string;
  title: string;
  year?: number;
  posterPath?: string | null;
  rating?: number | null;
  isFavorite?: boolean;
  progress?: number; // 0-100
  showProgress?: boolean;
}

export function MovieCard({
  id,
  title,
  year,
  posterPath,
  rating,
  isFavorite,
  progress,
  showProgress,
}: MovieCardProps) {
  return (
    <Link
      href={`/movies/${id}`}
      className="group flex-shrink-0 transition-transform hover:scale-[1.03]"
      style={{ width: 180 }}
    >
      {/* Poster */}
      <div className="relative w-full overflow-hidden rounded-lg bg-[var(--surface)]" style={{ height: 270 }}>
        {posterPath ? (
          <Image
            src={resolveImageSrc(posterPath)}
            alt={title}
            fill
            className="object-cover"
            sizes="180px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            No Poster
          </div>
        )}

        {/* Rating badge */}
        {rating != null && rating > 0 && (
          <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5">
            <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
            <span className="text-[11px] font-medium text-[var(--gold)]">
              {rating.toFixed(1)}
            </span>
          </div>
        )}

        {/* Favorite indicator */}
        {isFavorite && (
          <div className="absolute left-2 top-2">
            <Heart className="h-4 w-4 fill-red-500 text-red-500" />
          </div>
        )}

        {/* Progress bar */}
        {showProgress && progress != null && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Title & year below poster */}
      <div className="mt-1.5 px-0.5">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        {year && (
          <p className="text-xs text-muted-foreground">{year}</p>
        )}
      </div>
    </Link>
  );
}

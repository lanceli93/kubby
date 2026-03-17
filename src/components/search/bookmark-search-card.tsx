"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { getBuiltinIcon } from "@/lib/bookmark-icons";

export interface BookmarkSearchResult {
  id: string;
  timestampSeconds: number;
  discNumber?: number | null;
  iconType?: string | null;
  tags?: string[];
  note?: string | null;
  thumbnailPath?: string | null;
  createdAt: string;
  movieId: string;
  movieTitle: string;
  moviePosterPath?: string | null;
  movieYear?: number | null;
  matchReason: "tag" | "icon" | "note" | "movieTitle" | "actor";
}

export interface CustomIconData {
  id: string;
  label: string;
  imagePath: string;
  dotColor?: string;
}

interface BookmarkSearchCardProps {
  bookmark: BookmarkSearchResult;
  customIcons?: CustomIconData[];
  externalEnabled?: boolean;
  onExternalLaunch?: (movieId: string, disc?: number, startSeconds?: number) => void;
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function BookmarkSearchCard({ bookmark, customIcons, externalEnabled, onExternalLaunch }: BookmarkSearchCardProps) {
  const builtin = getBuiltinIcon(bookmark.iconType || "bookmark");
  const customIcon = !builtin
    ? customIcons?.find((c) => c.id === bookmark.iconType)
    : undefined;

  const discParam =
    bookmark.discNumber && bookmark.discNumber > 1
      ? `&disc=${bookmark.discNumber}`
      : "";
  const href = `/movies/${bookmark.movieId}/play?t=${bookmark.timestampSeconds}${discParam}`;

  // Use thumbnail or fall back to movie poster
  const imageSrc = bookmark.thumbnailPath
    ? resolveImageSrc(bookmark.thumbnailPath, 640)
    : bookmark.moviePosterPath
      ? resolveImageSrc(bookmark.moviePosterPath, 360)
      : null;

  function renderIcon() {
    if (builtin) {
      const Icon = builtin.icon;
      return (
        <Icon
          className={`h-3.5 w-3.5 ${builtin.color} ${
            builtin.id === "star"
              ? "fill-yellow-400"
              : builtin.id === "heart"
                ? "fill-red-400"
                : ""
          }`}
        />
      );
    }
    if (customIcon) {
      return (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={resolveImageSrc(customIcon.imagePath)}
          alt={customIcon.label}
          className="h-3.5 w-3.5 object-contain"
        />
      );
    }
    const fallback = getBuiltinIcon("bookmark")!;
    const FallbackIcon = fallback.icon;
    return <FallbackIcon className={`h-3.5 w-3.5 ${fallback.color}`} />;
  }

  const card = (
    <>
      <div className="relative w-[280px] aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900">
        {/* Image */}
        {imageSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageSrc}
            alt={`${bookmark.movieTitle} - ${formatTimestamp(bookmark.timestampSeconds)}`}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Clock className="h-8 w-8 text-white/20" />
          </div>
        )}

        {/* Bottom gradient bar with icon + timestamp */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
          {renderIcon()}
          <span className="text-xs font-medium text-white">
            {formatTimestamp(bookmark.timestampSeconds)}
          </span>
        </div>

        {/* Tags - top right */}
        {bookmark.tags && bookmark.tags.length > 0 && (
          <div className="absolute right-2 top-2 flex gap-1">
            {bookmark.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Disc badge */}
        {bookmark.discNumber && bookmark.discNumber > 1 && (
          <span className="absolute left-2 top-2 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            Disc {bookmark.discNumber}
          </span>
        )}
      </div>

      {/* Note below card */}
      {bookmark.note && (
        <p className="mt-1 max-w-[280px] truncate text-xs text-muted-foreground">
          {bookmark.note}
        </p>
      )}
    </>
  );

  if (externalEnabled && onExternalLaunch) {
    return (
      <div
        onClick={() => onExternalLaunch(bookmark.movieId, bookmark.discNumber ?? undefined, bookmark.timestampSeconds)}
        className="group flex-shrink-0 cursor-pointer text-left"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onExternalLaunch(bookmark.movieId, bookmark.discNumber ?? undefined, bookmark.timestampSeconds);
          }
        }}
      >
        {card}
      </div>
    );
  }

  return (
    <Link href={href} className="group flex-shrink-0">
      {card}
    </Link>
  );
}

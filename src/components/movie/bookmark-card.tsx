"use client";

import Link from "next/link";
import { Bookmark, Star, Clock, Trash2 } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";

interface BookmarkData {
  id: string;
  timestampSeconds: number;
  discNumber?: number;
  iconType?: string;
  tags?: string[];
  note?: string;
  thumbnailPath?: string | null;
}

interface BookmarkCardProps {
  bookmark: BookmarkData;
  movieId: string;
  externalEnabled?: boolean;
  onExternalLaunch?: (disc?: number, startSeconds?: number) => void;
  onDelete?: (bookmarkId: string) => void;
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function BookmarkCard({
  bookmark,
  movieId,
  externalEnabled,
  onExternalLaunch,
  onDelete,
}: BookmarkCardProps) {
  const IconComponent = bookmark.iconType === "star" ? Star : Bookmark;
  const iconColor = bookmark.iconType === "star" ? "text-yellow-400" : "text-blue-400";
  const discParam = bookmark.discNumber && bookmark.discNumber > 1 ? `&disc=${bookmark.discNumber}` : "";
  const href = `/movies/${movieId}/play?t=${bookmark.timestampSeconds}${discParam}`;

  const card = (
    <div className="group relative flex-shrink-0 w-[320px]">
      {/* Thumbnail — height adapts to image's native aspect ratio */}
      <div className="relative w-[320px] overflow-hidden rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900">
        {bookmark.thumbnailPath ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={resolveImageSrc(bookmark.thumbnailPath)}
            alt={`Bookmark at ${formatTimestamp(bookmark.timestampSeconds)}`}
            className="block w-full h-auto"
            draggable={false}
          />
        ) : (
          <div className="flex h-[180px] items-center justify-center">
            <Clock className="h-8 w-8 text-white/20" />
          </div>
        )}

        {/* Bottom gradient bar */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6">
          <IconComponent className={`h-4 w-4 ${iconColor} ${bookmark.iconType === "star" ? "fill-yellow-400" : ""}`} />
          <span className="text-sm font-medium text-white">
            {formatTimestamp(bookmark.timestampSeconds)}
          </span>
        </div>

        {/* Tags - top right */}
        {bookmark.tags && bookmark.tags.length > 0 && (
          <div className="absolute right-2 top-2 flex gap-1">
            {bookmark.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Disc badge - top left */}
        {bookmark.discNumber && bookmark.discNumber > 1 && (
          <span className="absolute left-2 top-2 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            Disc {bookmark.discNumber}
          </span>
        )}

        {/* Delete button on hover */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(bookmark.id);
            }}
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500/80 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100 cursor-pointer"
            title="Delete bookmark"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Note below card */}
      {bookmark.note && (
        <p className="mt-1 max-w-[320px] truncate text-xs text-muted-foreground">
          {bookmark.note}
        </p>
      )}
    </div>
  );

  if (externalEnabled && onExternalLaunch) {
    return (
      <button
        onClick={() => onExternalLaunch(bookmark.discNumber, bookmark.timestampSeconds)}
        className="text-left cursor-pointer"
      >
        {card}
      </button>
    );
  }

  return (
    <Link href={href}>
      {card}
    </Link>
  );
}

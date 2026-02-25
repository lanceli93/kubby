"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Trash2, MoreVertical, X } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { BUILTIN_BOOKMARK_ICONS, getBuiltinIcon } from "@/lib/bookmark-icons";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface BookmarkData {
  id: string;
  timestampSeconds: number;
  discNumber?: number;
  iconType?: string;
  tags?: string[];
  note?: string;
  thumbnailPath?: string | null;
}

export interface CustomIconData {
  id: string;
  label: string;
  imagePath: string;
}

interface BookmarkCardProps {
  bookmark: BookmarkData;
  movieId: string;
  externalEnabled?: boolean;
  onExternalLaunch?: (disc?: number, startSeconds?: number) => void;
  onDelete?: (bookmarkId: string) => void;
  onUpdate?: (bookmarkId: string, data: { iconType?: string; tags?: string[]; note?: string }) => void;
  customIcons?: CustomIconData[];
  disabledIconIds?: string[];
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
  onUpdate,
  customIcons,
  disabledIconIds,
}: BookmarkCardProps) {
  const tPM = useTranslations("personalMetadata");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editIconType, setEditIconType] = useState(bookmark.iconType || "bookmark");
  const [editTags, setEditTags] = useState<string[]>(bookmark.tags || []);
  const [editNote, setEditNote] = useState(bookmark.note || "");
  const [editTagInput, setEditTagInput] = useState("");

  // Resolve icon for display
  const builtin = getBuiltinIcon(bookmark.iconType || "bookmark");
  const customIcon = !builtin ? customIcons?.find((c) => c.id === bookmark.iconType) : undefined;
  const discParam = bookmark.discNumber && bookmark.discNumber > 1 ? `&disc=${bookmark.discNumber}` : "";
  const href = `/movies/${movieId}/play?t=${bookmark.timestampSeconds}${discParam}`;

  function openEdit() {
    setEditIconType(bookmark.iconType || "bookmark");
    setEditTags(bookmark.tags || []);
    setEditNote(bookmark.note || "");
    setEditTagInput("");
    setEditOpen(true);
  }

  function handleSave() {
    onUpdate?.(bookmark.id, {
      iconType: editIconType,
      tags: editTags,
      note: editNote || undefined,
    });
    setEditOpen(false);
  }

  // Render the icon in the bottom gradient bar
  function renderCardIcon() {
    if (builtin) {
      const Icon = builtin.icon;
      return (
        <Icon
          className={`h-4 w-4 ${builtin.color} ${builtin.id === "star" ? "fill-yellow-400" : builtin.id === "heart" ? "fill-red-400" : ""}`}
        />
      );
    }
    if (customIcon) {
      return (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={resolveImageSrc(customIcon.imagePath)}
          alt={customIcon.label}
          className="h-4 w-4 object-contain"
        />
      );
    }
    // Fallback to default bookmark icon
    const fallback = getBuiltinIcon("bookmark")!;
    const FallbackIcon = fallback.icon;
    return <FallbackIcon className={`h-4 w-4 ${fallback.color}`} />;
  }

  const card = (
    <div className="group relative flex-shrink-0 w-[320px]">
      {/* Thumbnail — height adapts to image's native aspect ratio */}
      <div className="relative w-[320px] overflow-hidden rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900">
        {bookmark.thumbnailPath ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={resolveImageSrc(bookmark.thumbnailPath, 640)}
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
          {renderCardIcon()}
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

        {/* Edit button on hover (bottom-left) */}
        {onUpdate && !confirmDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openEdit();
            }}
            className="absolute bottom-2 right-11 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100 cursor-pointer"
            title="Edit bookmark"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Delete button on hover (bottom-right) */}
        {onDelete && !confirmDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmDelete(true);
            }}
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500/80 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100 cursor-pointer"
            title="Delete bookmark"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Delete confirmation overlay */}
        {onDelete && confirmDelete && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/80"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <p className="text-sm text-white/90">Delete this bookmark?</p>
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirmDelete(false);
                }}
                className="rounded-md px-3 py-1.5 text-xs text-white/60 hover:text-white bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(bookmark.id);
                  setConfirmDelete(false);
                }}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white bg-red-500/80 hover:bg-red-500 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
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

  const wrappedCard = externalEnabled && onExternalLaunch ? (
    <button
      onClick={() => onExternalLaunch(bookmark.discNumber, bookmark.timestampSeconds)}
      className="text-left cursor-pointer"
    >
      {card}
    </button>
  ) : (
    <Link href={href}>
      {card}
    </Link>
  );

  return (
    <>
      {wrappedCard}

      {/* Edit bookmark dialog — rendered outside Link/button via portal */}
      {editOpen && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="border-white/10 bg-black/70 backdrop-blur-xl sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>Edit Bookmark</DialogTitle>
            </DialogHeader>

            {/* Timestamp (read-only) */}
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Timestamp</label>
              <div className="rounded-md bg-white/10 px-3 py-2 text-sm text-foreground">
                {formatTimestamp(bookmark.timestampSeconds)}
              </div>
            </div>

            {/* Icon type - scrollable grid */}
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Type</label>
              <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto">
                {BUILTIN_BOOKMARK_ICONS.filter((bi) => !disabledIconIds?.includes(bi.id)).map((bi) => {
                  const BiIcon = bi.icon;
                  return (
                    <button
                      key={bi.id}
                      onClick={() => setEditIconType(bi.id)}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                        editIconType === bi.id
                          ? `${bi.bgSelected} ${bi.color} ring-1 ${bi.ringSelected}`
                          : "bg-white/10 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <BiIcon className="h-3.5 w-3.5" />
                      {tPM(`builtinIcon_${bi.id}`)}
                    </button>
                  );
                })}
                {customIcons?.filter((ci) => !disabledIconIds?.includes(ci.id)).map((ci) => (
                  <button
                    key={ci.id}
                    onClick={() => setEditIconType(ci.id)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                      editIconType === ci.id
                        ? "bg-white/20 text-foreground ring-1 ring-white/50"
                        : "bg-white/10 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveImageSrc(ci.imagePath)} alt={ci.label} className="h-3.5 w-3.5 object-contain" />
                    {ci.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editTags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs text-foreground"
                  >
                    {tag}
                    <button
                      onClick={() => setEditTags(editTags.filter((t) => t !== tag))}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                value={editTagInput}
                onChange={(e) => setEditTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editTagInput.trim()) {
                    e.preventDefault();
                    if (!editTags.includes(editTagInput.trim())) {
                      setEditTags([...editTags, editTagInput.trim()]);
                    }
                    setEditTagInput("");
                  }
                }}
                placeholder="Type and press Enter to add"
                className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>

            {/* Note */}
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Note</label>
              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Optional note..."
                rows={2}
                className="w-full resize-none rounded-md bg-white/10 px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-white/30"
              />
            </div>

            <DialogFooter>
              <button
                onClick={() => setEditOpen(false)}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 cursor-pointer"
              >
                Save
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

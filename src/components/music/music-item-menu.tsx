"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { GlassToast } from "@/components/ui/glass-toast";
import {
  MusicMetadataEditor,
  type MusicEntityType,
} from "@/components/music/music-metadata-editor";
import { MusicDeleteDialog } from "@/components/music/music-delete-dialog";

interface MusicItemMenuProps {
  type: MusicEntityType;
  id: string;
  initial: React.ComponentProps<typeof MusicMetadataEditor>["initial"];
  /** React Query keys to invalidate after edit or delete. */
  invalidateKeys?: readonly unknown[][];
  /** Where to navigate after a successful delete (e.g. back to /music). */
  onDeleted?: () => void;
  /** Optional class for the trigger button (positioning). */
  triggerClassName?: string;
  /** Visual style: "overlay" (light, for on-cover) or "row" (muted, for lists). */
  variant?: "overlay" | "row";
}

/**
 * The ⋯ actions menu for a music album / artist / track: Edit metadata + Delete.
 * Admin-only (hidden entirely for non-admins). Owns the edit + delete dialogs,
 * performs the DELETE request, and invalidates caches / navigates on success.
 */
export function MusicItemMenu({
  type,
  id,
  initial,
  invalidateKeys = [],
  onDeleted,
  triggerClassName,
  variant = "row",
}: MusicItemMenuProps) {
  const t = useTranslations("music");
  const { data: session } = useSession();
  const isAdmin = !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  const queryClient = useQueryClient();

  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);

  if (!isAdmin) return null;

  const labels = {
    album: { edit: t("editAlbum"), del: t("deleteAlbum"), confirm: t("confirmDeleteAlbum") },
    artist: { edit: t("editArtist"), del: t("deleteArtist"), confirm: t("confirmDeleteArtist") },
    track: { edit: t("editTrack"), del: t("deleteTrack"), confirm: t("confirmDeleteTrack") },
  }[type];

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDelete = async (deleteFiles: boolean) => {
    try {
      const res = await fetch(
        `/api/music/${type}s/${id}${deleteFiles ? "?deleteFiles=true" : ""}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("delete failed");
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      setToast({ text: t("deleted"), success: true });
      if (onDeleted) setTimeout(onDeleted, 400);
    } catch {
      setToast({ text: t("deleteFailed"), success: false });
    }
  };

  const triggerBase =
    variant === "overlay"
      ? "text-white/80 hover:bg-white/20"
      : "text-muted-foreground hover:bg-white/10 hover:text-foreground";

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            onClick={stop}
            aria-label={t("editMetadata")}
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-colors ${triggerBase} ${triggerClassName ?? ""}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44 border-white/10 bg-black/70 backdrop-blur-xl"
          onClick={stop}
        >
          <DropdownMenuItem
            onClick={(e) => {
              stop(e);
              setEditOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            {labels.edit}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={(e) => {
              stop(e);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            {labels.del}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && (
        <MusicMetadataEditor
          type={type}
          id={id}
          initial={initial}
          open={editOpen}
          onOpenChange={setEditOpen}
          invalidateKeys={invalidateKeys}
        />
      )}

      {deleteOpen && (
        <MusicDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={labels.del}
          description={labels.confirm}
          onConfirm={handleDelete}
        />
      )}

      <GlassToast visible={!!toast} success={toast?.success} className="z-[100]">
        {toast?.text}
      </GlassToast>
    </>
  );
}

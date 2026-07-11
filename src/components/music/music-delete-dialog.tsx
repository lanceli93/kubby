"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface MusicDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Called with whether the user opted to also delete source files. */
  onConfirm: (deleteFiles: boolean) => void;
}

/**
 * Confirmation dialog for deleting a music album / artist / track. Offers an
 * optional "also delete source files from disk" checkbox (default OFF → DB-only,
 * the safe default), mirroring the movie delete dialog.
 */
export function MusicDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: MusicDeleteDialogProps) {
  const t = useTranslations("music");
  const tCommon = useTranslations("common");
  const [deleteFiles, setDeleteFiles] = useState(false);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setDeleteFiles(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 px-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 accent-destructive"
            />
            <span className="text-sm text-foreground">{t("deleteSourceFiles")}</span>
          </label>
          {deleteFiles && (
            <p className="pl-6 text-xs text-destructive">{t("deleteSourceFilesWarning")}</p>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => close(false)}
            className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={() => {
              onConfirm(deleteFiles);
              close(false);
            }}
            className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 cursor-pointer"
          >
            {tCommon("confirm")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

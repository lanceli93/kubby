"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GlassToast } from "@/components/ui/glass-toast";

export type MusicEntityType = "album" | "artist" | "track";

interface MusicMetadataEditorProps {
  type: MusicEntityType;
  id: string;
  /** Current values to seed the form (only the fields relevant to `type`). */
  initial: {
    title?: string;
    name?: string;
    sortName?: string;
    sortTitle?: string;
    year?: number | null;
    trackNumber?: number | null;
    discNumber?: number | null;
    genres?: string[];
    overview?: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Query keys to invalidate on a successful save. */
  invalidateKeys?: readonly unknown[][];
}

/**
 * Shared metadata editor for a music album / artist / track. Fields shown adapt
 * to `type`. PUTs to the matching `/api/music/{type}s/[id]` route, then
 * invalidates the supplied React Query keys.
 */
export function MusicMetadataEditor({
  type,
  id,
  initial,
  open,
  onOpenChange,
  invalidateKeys = [],
}: MusicMetadataEditorProps) {
  const t = useTranslations("music");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    title: "",
    name: "",
    sortName: "",
    year: "",
    trackNumber: "",
    discNumber: "",
    genres: "",
    overview: "",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      title: initial.title ?? "",
      name: initial.name ?? "",
      sortName: initial.sortName ?? initial.sortTitle ?? "",
      year: initial.year != null ? String(initial.year) : "",
      trackNumber: initial.trackNumber != null ? String(initial.trackNumber) : "",
      discNumber: initial.discNumber != null ? String(initial.discNumber) : "",
      genres: (initial.genres ?? []).join(", "),
      overview: initial.overview ?? "",
    });
    // Seed once per open — initial is a fresh object each render, so key on `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  const title =
    type === "album" ? t("editAlbum") : type === "artist" ? t("editArtist") : t("editTrack");

  // Only edit/send genres when the caller supplied them (e.g. the album detail
  // page). Opening the editor from a card — which has no genres — must not wipe
  // them, so we hide the field and omit it from the request there.
  const showGenres = type === "album" && initial.genres !== undefined;

  const handleSave = async () => {
    setSaving(true);
    try {
      let body: Record<string, unknown>;
      if (type === "album") {
        body = { title: form.title, year: form.year };
        if (showGenres) {
          body.genres = form.genres.split(",").map((g) => g.trim()).filter(Boolean);
        }
      } else if (type === "artist") {
        body = { name: form.name, sortName: form.sortName, overview: form.overview };
      } else {
        body = {
          title: form.title,
          trackNumber: form.trackNumber,
          discNumber: form.discNumber,
          year: form.year,
        };
      }

      const res = await fetch(`/api/music/${type}s/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save failed");

      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      setToast({ text: t("saved"), success: true });
      setTimeout(() => onOpenChange(false), 600);
    } catch {
      setToast({ text: t("saveFailed"), success: false });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {type === "artist" ? (
            <>
              <Field label={t("name")}>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </Field>
              <Field label={t("sortName")}>
                <Input value={form.sortName} onChange={(e) => setForm((f) => ({ ...f, sortName: e.target.value }))} />
              </Field>
              <Field label={t("overview")}>
                <Textarea
                  rows={4}
                  value={form.overview}
                  onChange={(e) => setForm((f) => ({ ...f, overview: e.target.value }))}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label={t("title2")}>
                <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </Field>

              {type === "track" ? (
                <div className="flex gap-3">
                  <Field label={t("trackNumber")} className="flex-1">
                    <Input
                      type="number"
                      min={0}
                      value={form.trackNumber}
                      onChange={(e) => setForm((f) => ({ ...f, trackNumber: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("discNumber")} className="flex-1">
                    <Input
                      type="number"
                      min={0}
                      value={form.discNumber}
                      onChange={(e) => setForm((f) => ({ ...f, discNumber: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("year")} className="flex-1">
                    <Input
                      type="number"
                      min={0}
                      value={form.year}
                      onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <Field label={t("year")}>
                    <Input
                      type="number"
                      min={0}
                      value={form.year}
                      onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                    />
                  </Field>
                  {showGenres && (
                    <Field label={t("genres")} hint={t("genresHint")}>
                      <Input value={form.genres} onChange={(e) => setForm((f) => ({ ...f, genres: e.target.value }))} />
                    </Field>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
          >
            {t("save")}
          </button>
        </DialogFooter>

        <GlassToast visible={!!toast} success={toast?.success} className="z-[100]">
          {toast?.text}
        </GlassToast>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">
        {label}
        {hint && <span className="ml-1.5 text-muted-foreground/50">({hint})</span>}
      </Label>
      {children}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getTier, getTierColor, getTierBorderColor } from "@/lib/tier";

interface PersonMetadataEditorProps {
  personId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PersonData {
  id: string;
  name: string;
  type: string;
  tmdbId?: string;
  imdbId?: string;
  overview?: string;
  birthDate?: string;
  birthYear?: number;
  placeOfBirth?: string;
  deathDate?: string;
  userData?: {
    personalRating?: number | null;
  };
}

export function PersonMetadataEditor({ personId, open, onOpenChange }: PersonMetadataEditorProps) {
  const queryClient = useQueryClient();
  const t = useTranslations("metadata");
  const tCommon = useTranslations("common");

  const { data: person } = useQuery<PersonData>({
    queryKey: ["person", personId],
    queryFn: () => fetch(`/api/people/${personId}`).then((r) => r.json()),
    enabled: open,
  });

  const [form, setForm] = useState({
    name: "",
    type: "actor",
    overview: "",
    birthDate: "",
    birthYear: "",
    placeOfBirth: "",
    deathDate: "",
    tmdbId: "",
    imdbId: "",
    personalRating: "",
  });

  const [hoverRating, setHoverRating] = useState<number | null>(null);

  useEffect(() => {
    if (person) {
      setForm({
        name: person.name || "",
        type: person.type || "actor",
        overview: person.overview || "",
        birthDate: person.birthDate || "",
        birthYear: person.birthYear?.toString() || "",
        placeOfBirth: person.placeOfBirth || "",
        deathDate: person.deathDate || "",
        tmdbId: person.tmdbId || "",
        imdbId: person.imdbId || "",
        personalRating: person.userData?.personalRating?.toString() || "",
      });
    }
  }, [person]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/people/${personId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to save");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person", personId] });
      onOpenChange(false);
    },
  });

  const handleSave = async () => {
    // Save personal rating via user-data API first
    await fetch(`/api/people/${personId}/user-data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personalRating: form.personalRating ? Number(form.personalRating) : null,
      }),
    });

    mutation.mutate({
      name: form.name,
      type: form.type,
      overview: form.overview || null,
      birthDate: form.birthDate || null,
      birthYear: form.birthYear ? Number(form.birthYear) : null,
      placeOfBirth: form.placeOfBirth || null,
      deathDate: form.deathDate || null,
      tmdbId: form.tmdbId || null,
      imdbId: form.imdbId || null,
    });
  };

  // Star rating helpers for Personal tab
  const ratingNum = form.personalRating ? Number(form.personalRating) : null;
  const displayRating = hoverRating ?? ratingNum;
  const currentTier = ratingNum && ratingNum > 0 ? getTier(ratingNum) : null;

  const handleStarClick = (starIndex: number, isHalf: boolean) => {
    const newRating = (starIndex + 1) * 2 - (isHalf ? 1 : 0);
    setForm((f) => ({ ...f, personalRating: newRating.toString() }));
  };

  const handleFine = (delta: number) => {
    const base = ratingNum ?? 0;
    const next = Math.max(0, Math.min(10, Math.round((base + delta) * 10) / 10));
    setForm((f) => ({ ...f, personalRating: next.toString() }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editMetadata")}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">{t("general")}</TabsTrigger>
            <TabsTrigger value="personal">{t("personal")}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>{t("name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("type")}</Label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
              >
                <option value="actor">{t("actor")}</option>
                <option value="director">{t("director")}</option>
                <option value="writer">{t("writer")}</option>
                <option value="producer">{t("producer")}</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>{t("biography")}</Label>
              <Textarea
                rows={4}
                value={form.overview}
                onChange={(e) => setForm((f) => ({ ...f, overview: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("birthDate")}</Label>
                <Input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("birthYear")}</Label>
                <Input
                  type="number"
                  value={form.birthYear}
                  onChange={(e) => setForm((f) => ({ ...f, birthYear: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("placeOfBirth")}</Label>
              <Input
                value={form.placeOfBirth}
                onChange={(e) => setForm((f) => ({ ...f, placeOfBirth: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("deathDate")}</Label>
              <Input
                type="date"
                value={form.deathDate}
                onChange={(e) => setForm((f) => ({ ...f, deathDate: e.target.value }))}
              />
            </div>

            {/* External IDs section */}
            <div className="pt-2">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">{t("externalIds")}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>TMDB ID</Label>
                  <Input
                    value={form.tmdbId}
                    onChange={(e) => setForm((f) => ({ ...f, tmdbId: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>IMDB ID</Label>
                  <Input
                    value={form.imdbId}
                    onChange={(e) => setForm((f) => ({ ...f, imdbId: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="personal" className="space-y-6 pt-4">
            {/* Personal Rating with star UI */}
            <div className="space-y-3">
              <Label>{t("personalRating")}</Label>
              <div className="flex flex-col items-center gap-3">
                {/* Stars */}
                <div
                  className="flex items-center gap-0.5"
                  onMouseLeave={() => setHoverRating(null)}
                >
                  {[0, 1, 2, 3, 4].map((starIndex) => {
                    const starValue = (starIndex + 1) * 2;
                    const halfValue = starValue - 1;
                    const current = displayRating ?? 0;

                    let fill: "full" | "half" | "empty" = "empty";
                    if (current >= starValue) fill = "full";
                    else if (current >= halfValue) fill = "half";

                    return (
                      <div
                        key={starIndex}
                        className="relative h-8 w-8 cursor-pointer"
                        onMouseMove={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const isLeft = e.clientX - rect.left < rect.width / 2;
                          setHoverRating(isLeft ? halfValue : starValue);
                        }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const isLeft = e.clientX - rect.left < rect.width / 2;
                          handleStarClick(starIndex, isLeft);
                        }}
                      >
                        <Star className="absolute inset-0 h-8 w-8 text-white/20" />
                        {fill !== "empty" && (
                          <div
                            className="absolute inset-0 overflow-hidden"
                            style={{ width: fill === "full" ? "100%" : "50%" }}
                          >
                            <Star className="h-8 w-8 fill-[var(--gold)] text-[var(--gold)]" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Numeric display + fine controls */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleFine(-0.1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/70 text-xs transition-colors hover:bg-white/10"
                  >
                    −
                  </button>
                  <span className="min-w-[3rem] text-center text-xl font-bold text-[var(--gold)] tabular-nums">
                    {ratingNum != null && ratingNum > 0 ? ratingNum.toFixed(1) : "—"}
                  </span>
                  <button
                    onClick={() => handleFine(0.1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/70 text-xs transition-colors hover:bg-white/10"
                  >
                    +
                  </button>
                </div>

                {/* Clear button */}
                {ratingNum != null && ratingNum > 0 && (
                  <button
                    onClick={() => setForm((f) => ({ ...f, personalRating: "" }))}
                    className="text-xs text-white/40 hover:text-white/70"
                  >
                    {t("clearRating")}
                  </button>
                )}
              </div>
            </div>

            {/* Auto-calculated tier */}
            <div className="space-y-3">
              <Label>{t("personalTier")}</Label>
              {currentTier ? (
                <div className="flex items-center gap-3">
                  <span className={`rounded-md border px-3 py-1.5 text-lg font-black tracking-wider ${getTierColor(currentTier)} ${getTierBorderColor(currentTier)}`}>
                    {currentTier}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("tierAutoCalculated")}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("tierNoRating")}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? t("saving") : tCommon("save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, CalendarDays, X } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getTier, getTierColor, getTierBorderColor, getTierGlow } from "@/lib/tier";
import { useUserPreferences } from "@/hooks/use-user-preferences";

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
  tags?: string[];
  userData?: {
    personalRating?: number | null;
    dimensionRatings?: Record<string, number> | null;
  };
}

export function PersonMetadataEditor({ personId, open, onOpenChange }: PersonMetadataEditorProps) {
  const queryClient = useQueryClient();
  const t = useTranslations("metadata");
  const tCommon = useTranslations("common");
  const { data: prefs } = useUserPreferences();
  const personDimensions = prefs?.personRatingDimensions ?? [];

  const { data: person } = useQuery<PersonData>({
    queryKey: ["person", personId],
    queryFn: () => fetch(`/api/people/${personId}`).then((r) => r.json()),
    enabled: open,
  });

  const [form, setForm] = useState({
    name: "",
    type: "actor",
    overview: "",
    birthInput: "",
    placeOfBirth: "",
    deathDate: "",
    tmdbId: "",
    imdbId: "",
    personalRating: "",
  });

  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [birthInputError, setBirthInputError] = useState("");
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [dimensionRatings, setDimensionRatings] = useState<Record<string, number>>({});

  useEffect(() => {
    if (person) {
      setForm({
        name: person.name || "",
        type: person.type || "actor",
        overview: person.overview || "",
        birthInput: person.birthDate || person.birthYear?.toString() || "",
        placeOfBirth: person.placeOfBirth || "",
        deathDate: person.deathDate || "",
        tmdbId: person.tmdbId || "",
        imdbId: person.imdbId || "",
        personalRating: person.userData?.personalRating?.toString() || "",
      });
      setTags(person.tags || []);
      if (person.userData?.dimensionRatings) {
        setDimensionRatings(person.userData.dimensionRatings);
      }
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
    // Compute personal rating: if dimensions configured, use average of dimension values
    let personalRating: number | null = form.personalRating ? Number(form.personalRating) : null;
    let dimRatingsToSend: Record<string, number> | null = null;

    if (personDimensions.length > 0) {
      // Only use current dimensions, discard stale keys
      const cleanRatings: Record<string, number> = {};
      for (const dim of personDimensions) {
        if (dimensionRatings[dim] != null && dimensionRatings[dim] > 0) cleanRatings[dim] = dimensionRatings[dim];
      }
      const values = Object.values(cleanRatings);
      if (values.length > 0) {
        personalRating = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
      } else {
        personalRating = null;
      }
      dimRatingsToSend = cleanRatings;
    }

    // Save personal rating via user-data API first
    await fetch(`/api/people/${personId}/user-data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personalRating,
        dimensionRatings: dimRatingsToSend,
      }),
    });

    // Validate and parse unified birth input
    let birthDate: string | null = null;
    let birthYear: number | null = null;
    const trimmed = form.birthInput.trim();
    if (trimmed) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        birthDate = trimmed;
        birthYear = Number(trimmed.slice(0, 4));
      } else if (/^\d{4}$/.test(trimmed)) {
        birthYear = Number(trimmed);
      } else {
        setBirthInputError(t("birthInputFormatError"));
        return;
      }
    }
    setBirthInputError("");

    mutation.mutate({
      name: form.name,
      type: form.type,
      overview: form.overview || null,
      birthDate,
      birthYear,
      placeOfBirth: form.placeOfBirth || null,
      deathDate: form.deathDate || null,
      tmdbId: form.tmdbId || null,
      imdbId: form.imdbId || null,
      tags: tags.length > 0 ? tags : null,
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
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="h-11 w-full rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="actor">{t("actor")}</SelectItem>
                  <SelectItem value="director">{t("director")}</SelectItem>
                  <SelectItem value="writer">{t("writer")}</SelectItem>
                  <SelectItem value="producer">{t("producer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("biography")}</Label>
              <Textarea
                rows={4}
                value={form.overview}
                onChange={(e) => setForm((f) => ({ ...f, overview: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("birthDate")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={form.birthInput}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, birthInput: e.target.value }));
                    setBirthInputError("");
                  }}
                  placeholder="1990-05-15 or 1990"
                />
                <div
                  className="relative flex-shrink-0 cursor-pointer"
                  onClick={() => datePickerRef.current?.showPicker()}
                >
                  <input
                    ref={datePickerRef}
                    type="date"
                    className="absolute inset-0 h-full w-full opacity-0 pointer-events-none"
                    style={{ colorScheme: "dark" }}
                    tabIndex={-1}
                    onChange={(e) => {
                      if (e.target.value) {
                        setForm((f) => ({ ...f, birthInput: e.target.value }));
                        setBirthInputError("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground pointer-events-none"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {birthInputError && (
                <p className="text-xs text-red-400">{birthInputError}</p>
              )}
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

            {/* Tags */}
            <div className="space-y-2">
              <Label>{t("tags")}</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-primary/60 hover:text-primary"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const val = tagInput.trim();
                    if (val && !tags.includes(val)) {
                      setTags((prev) => [...prev, val]);
                    }
                    setTagInput("");
                  }
                }}
                placeholder={t("addTagPlaceholder")}
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
            {personDimensions.length > 0 ? (
              <>
                {/* Per-dimension inputs */}
                {personDimensions.map((dim) => (
                  <div key={dim} className="space-y-2">
                    <Label className="block truncate max-w-[16rem]" title={dim}>{dim}</Label>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-0.5">
                        {[0, 1, 2, 3, 4].map((starIndex) => {
                          const starValue = (starIndex + 1) * 2;
                          const halfValue = starValue - 1;
                          const current = dimensionRatings[dim] ?? 0;

                          let fill: "full" | "half" | "empty" = "empty";
                          if (current >= starValue) fill = "full";
                          else if (current >= halfValue) fill = "half";

                          return (
                            <div
                              key={starIndex}
                              className="relative h-6 w-6 cursor-pointer"
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const isLeft = e.clientX - rect.left < rect.width / 2;
                                const newRating = (starIndex + 1) * 2 - (isLeft ? 1 : 0);
                                setDimensionRatings((prev) => ({ ...prev, [dim]: newRating }));
                              }}
                            >
                              <Star className="absolute inset-0 h-6 w-6 text-white/20" />
                              {fill !== "empty" && (
                                <div
                                  className="absolute inset-0 overflow-hidden"
                                  style={{ width: fill === "full" ? "100%" : "50%" }}
                                >
                                  <Star className="h-6 w-6 fill-[var(--gold)] text-[var(--gold)]" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const base = dimensionRatings[dim] ?? 0;
                          const next = Math.max(0, Math.round((base - 0.1) * 10) / 10);
                          setDimensionRatings((prev) => ({ ...prev, [dim]: next }));
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/70 text-xs transition-colors hover:bg-white/10"
                      >
                        −
                      </button>
                      <span className="min-w-[2.5rem] text-center text-sm font-bold text-[var(--gold)] tabular-nums">
                        {dimensionRatings[dim] ? dimensionRatings[dim].toFixed(1) : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const base = dimensionRatings[dim] ?? 0;
                          const next = Math.min(10, Math.round((base + 0.1) * 10) / 10);
                          setDimensionRatings((prev) => ({ ...prev, [dim]: next }));
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/70 text-xs transition-colors hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}

                {/* Computed average + tier */}
                <div className="space-y-3 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between">
                    <Label>{t("personalRating")}</Label>
                    {personDimensions.some((d) => dimensionRatings[d] > 0) && (
                      <button
                        type="button"
                        onClick={() => setDimensionRatings({})}
                        className="text-xs text-red-400/70 hover:text-red-400"
                      >
                        {t("clearRating")}
                      </button>
                    )}
                  </div>
                  <p className="text-lg font-bold text-[var(--gold)]">
                    {(() => {
                      const values = personDimensions.map((d) => dimensionRatings[d]).filter((v) => v != null && v > 0);
                      if (values.length === 0) return "—";
                      return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
                    })()}
                  </p>
                </div>

                {/* Auto-calculated tier */}
                <div className="space-y-3">
                  <Label>{t("personalTier")}</Label>
                  {(() => {
                    const values = personDimensions.map((d) => dimensionRatings[d]).filter((v) => v != null && v > 0);
                    if (values.length === 0) return <p className="text-sm text-muted-foreground">{t("tierNoRating")}</p>;
                    const avg = values.reduce((a, b) => a + b, 0) / values.length;
                    const tier = getTier(avg);
                    return (
                      <div className="flex items-center gap-3">
                        <span className={`rounded-md border px-3 py-1.5 text-lg font-black tracking-wider ${getTierColor(tier)} ${getTierBorderColor(tier)} ${getTierGlow(tier)}`}>
                          {tier}
                        </span>
                        <span className="text-xs text-muted-foreground">{t("tierAutoCalculated")}</span>
                      </div>
                    );
                  })()}
                </div>
              </>
            ) : (
              <>
                {/* Original single rating with star UI */}
                <div className="space-y-3">
                  <Label>{t("personalRating")}</Label>
                  <div className="flex flex-col items-center gap-3">
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
                      <span className={`rounded-md border px-3 py-1.5 text-lg font-black tracking-wider ${getTierColor(currentTier)} ${getTierBorderColor(currentTier)} ${getTierGlow(currentTier)}`}>
                        {currentTier}
                      </span>
                      <span className="text-xs text-muted-foreground">{t("tierAutoCalculated")}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("tierNoRating")}</p>
                  )}
                </div>
              </>
            )}
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
            className="rounded-md border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
          >
            {mutation.isPending ? t("saving") : tCommon("save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

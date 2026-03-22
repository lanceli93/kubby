"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Star, Upload, Trash2, ImageIcon, Info } from "lucide-react";
import Image from "next/image";
import { resolveImageSrc } from "@/lib/image-utils";
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
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { GlassToast } from "@/components/ui/glass-toast";

interface MovieMetadataEditorProps {
  movieId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CastEntry {
  name: string;
  type: "actor" | "director" | "writer" | "producer";
  role: string;
}

interface MovieData {
  id: string;
  title: string;
  originalTitle?: string;
  sortName?: string;
  overview?: string;
  tagline?: string;
  year?: number;
  premiereDate?: string;
  runtimeMinutes?: number;
  communityRating?: number;
  officialRating?: string;
  country?: string;
  genres?: string[];
  studios?: string[];
  tags?: string[];
  posterPath?: string | null;
  fanartPath?: string | null;
  tmdbId?: string;
  imdbId?: string;
  allPeople?: { id: string; name: string; type: string; role?: string; sortOrder?: number }[];
  userData?: {
    isPlayed: boolean;
    isFavorite: boolean;
    playbackPositionSeconds: number;
    playCount: number;
    personalRating?: number | null;
    dimensionRatings?: Record<string, number> | null;
  };
}

export function MovieMetadataEditor({ movieId, open, onOpenChange }: MovieMetadataEditorProps) {
  const queryClient = useQueryClient();
  const t = useTranslations("metadata");
  const tCommon = useTranslations("common");
  const { data: prefs } = useUserPreferences();
  const movieDimensions = prefs?.movieRatingDimensions ?? [];

  const { data: movie } = useQuery<MovieData>({
    queryKey: ["movie", movieId],
    queryFn: () => fetch(`/api/movies/${movieId}`).then((r) => r.json()),
    enabled: open,
  });

  const [form, setForm] = useState({
    title: "",
    originalTitle: "",
    sortName: "",
    overview: "",
    tagline: "",
    year: "",
    premiereDate: "",
    runtimeMinutes: "",
    communityRating: "",
    officialRating: "",
    country: "",
    genres: [] as string[],
    studios: [] as string[],
    tags: [] as string[],
    tmdbId: "",
    imdbId: "",
    personalRating: "",
  });

  const [castEntries, setCastEntries] = useState<CastEntry[]>([]);

  const [genreInput, setGenreInput] = useState("");
  const [studioInput, setStudioInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [dimensionRatings, setDimensionRatings] = useState<Record<string, number>>({});
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Star rating helpers for Personal tab (no-dimension mode)
  const ratingNum = form.personalRating ? Number(form.personalRating) : null;
  const displayRating = hoverRating ?? ratingNum;

  const handleStarClick = (starIndex: number, isHalf: boolean) => {
    const newRating = (starIndex + 1) * 2 - (isHalf ? 1 : 0);
    setForm((f) => ({ ...f, personalRating: newRating.toString() }));
  };

  const handleFine = (delta: number) => {
    const base = ratingNum ?? 0;
    const next = Math.max(0, Math.min(10, Math.round((base + delta) * 10) / 10));
    setForm((f) => ({ ...f, personalRating: next.toString() }));
  };

  useEffect(() => {
    if (movie) {
      setForm({
        title: movie.title || "",
        originalTitle: movie.originalTitle || "",
        sortName: movie.sortName || "",
        overview: movie.overview || "",
        tagline: movie.tagline || "",
        year: movie.year?.toString() || "",
        premiereDate: movie.premiereDate || "",
        runtimeMinutes: movie.runtimeMinutes?.toString() || "",
        communityRating: movie.communityRating?.toString() || "",
        officialRating: movie.officialRating || "",
        country: movie.country || "",
        genres: movie.genres || [],
        studios: movie.studios || [],
        tags: movie.tags || [],
        tmdbId: movie.tmdbId || "",
        imdbId: movie.imdbId || "",
        personalRating: movie.userData?.personalRating?.toString() || "",
      });
      if (movie.allPeople) {
        setCastEntries(
          movie.allPeople.map((p) => ({
            name: p.name,
            type: (p.type as CastEntry["type"]) || "actor",
            role: p.role || "",
          }))
        );
      }
      if (movie.userData?.dimensionRatings) {
        setDimensionRatings(movie.userData.dimensionRatings);
      }
    }
  }, [movie]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/movies/${movieId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to save");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movie", movieId] });
      onOpenChange(false);
    },
  });

  const showToast = (text: string, success: boolean) => {
    clearTimeout(toastTimer.current);
    setToast({ text, success });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  // Image editing state & handlers
  const [imgUploading, setImgUploading] = useState<"poster" | "fanart" | null>(null);
  const [imgDeleting, setImgDeleting] = useState<"poster" | "fanart" | null>(null);
  const posterInputRef = useRef<HTMLInputElement>(null);
  const fanartInputRef = useRef<HTMLInputElement>(null);
  const imgBusy = imgUploading !== null || imgDeleting !== null;

  const handleImageUpload = async (type: "poster" | "fanart", file: File) => {
    setImgUploading(type);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await fetch(`/api/movies/${movieId}/images?type=${type}`, { method: "POST", body: formData });
      queryClient.invalidateQueries({ queryKey: ["movie", movieId] });
    } finally {
      setImgUploading(null);
    }
  };

  const handleImageDelete = async (type: "poster" | "fanart") => {
    setImgDeleting(type);
    try {
      await fetch(`/api/movies/${movieId}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      queryClient.invalidateQueries({ queryKey: ["movie", movieId] });
    } finally {
      setImgDeleting(null);
    }
  };

  const onImageFileSelected = (type: "poster" | "fanart") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageUpload(type, file);
    e.target.value = "";
  };

  const handleSave = async () => {
    // Check year/premiereDate consistency
    if (form.year && form.premiereDate) {
      const dateYear = parseInt(form.premiereDate.split("-")[0], 10);
      if (dateYear && Number(form.year) !== dateYear) {
        showToast(t("yearDateMismatch"), false);
        return;
      }
    }

    // Compute personal rating: if dimensions configured, use average of dimension values
    let personalRating: number | null = form.personalRating ? Number(form.personalRating) : null;
    let dimRatingsToSend: Record<string, number> | null = null;

    if (movieDimensions.length > 0) {
      // Only use current dimensions, discard stale keys
      const cleanRatings: Record<string, number> = {};
      for (const dim of movieDimensions) {
        if (dimensionRatings[dim] != null && dimensionRatings[dim] > 0) cleanRatings[dim] = dimensionRatings[dim];
      }
      const movieWeights = prefs?.movieDimensionWeights ?? {};
      let weightedSum = 0, weightSum = 0;
      for (const [dim, val] of Object.entries(cleanRatings)) {
        const w = movieWeights[dim] ?? 1;
        weightedSum += val * w;
        weightSum += w;
      }
      personalRating = weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : null;
      dimRatingsToSend = cleanRatings;
    }

    // Save personal rating via user-data API first (must complete before query invalidation)
    await fetch(`/api/movies/${movieId}/user-data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personalRating,
        dimensionRatings: dimRatingsToSend,
      }),
    });

    mutation.mutate({
      title: form.title,
      originalTitle: form.originalTitle || null,
      sortName: form.sortName || null,
      overview: form.overview || null,
      tagline: form.tagline || null,
      year: form.year ? Number(form.year) : null,
      premiereDate: form.premiereDate || null,
      runtimeMinutes: form.runtimeMinutes ? Number(form.runtimeMinutes) : null,
      communityRating: form.communityRating ? Number(form.communityRating) : null,
      officialRating: form.officialRating || null,
      country: form.country || null,
      genres: form.genres,
      studios: form.studios,
      tags: form.tags,
      tmdbId: form.tmdbId || null,
      imdbId: form.imdbId || null,
      cast: castEntries,
    });
  };

  const handleGenreKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && genreInput.trim()) {
      e.preventDefault();
      if (!form.genres.includes(genreInput.trim())) {
        setForm((f) => ({ ...f, genres: [...f.genres, genreInput.trim()] }));
      }
      setGenreInput("");
    }
  };

  const handleStudioKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && studioInput.trim()) {
      e.preventDefault();
      if (!form.studios.includes(studioInput.trim())) {
        setForm((f) => ({ ...f, studios: [...f.studios, studioInput.trim()] }));
      }
      setStudioInput("");
    }
  };

  const removeGenre = (genre: string) => {
    setForm((f) => ({ ...f, genres: f.genres.filter((g) => g !== genre) }));
  };

  const removeStudio = (studio: string) => {
    setForm((f) => ({ ...f, studios: f.studios.filter((s) => s !== studio) }));
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      if (!form.tags.includes(tagInput.trim())) {
        setForm((f) => ({ ...f, tags: [...f.tags, tagInput.trim()] }));
      }
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl max-h-[100dvh] w-full rounded-none sm:max-w-[800px] sm:rounded-lg overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{t("editMetadata")}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">{t("general")}</TabsTrigger>
            <TabsTrigger value="cast">{t("cast")}</TabsTrigger>
            <TabsTrigger value="images">{t("images")}</TabsTrigger>
            <TabsTrigger value="personal">{t("personal")}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>{t("title")}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("originalTitle")}</Label>
              <Input
                value={form.originalTitle}
                onChange={(e) => setForm((f) => ({ ...f, originalTitle: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("sortTitle")}</Label>
              <Input
                value={form.sortName}
                onChange={(e) => setForm((f) => ({ ...f, sortName: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("overview")}</Label>
              <Textarea
                rows={4}
                value={form.overview}
                onChange={(e) => setForm((f) => ({ ...f, overview: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("tagline")}</Label>
              <Input
                value={form.tagline}
                onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("year")}</Label>
                <Input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("premiereDate")}</Label>
                <Input
                  type="date"
                  value={form.premiereDate}
                  onChange={(e) => setForm((f) => ({ ...f, premiereDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("runtime")}</Label>
                <Input
                  type="number"
                  value={form.runtimeMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, runtimeMinutes: e.target.value }))}
                  placeholder={t("runtimeMinutes")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("communityRating")}</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={form.communityRating}
                  onChange={(e) => setForm((f) => ({ ...f, communityRating: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("officialRating")}</Label>
                <Input
                  value={form.officialRating}
                  onChange={(e) => setForm((f) => ({ ...f, officialRating: e.target.value }))}
                  placeholder="PG-13, R, etc."
                />
              </div>
              <div className="space-y-2">
                <Label>{t("country")}</Label>
                <Input
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                />
              </div>
            </div>

            {/* Genres tag input */}
            <div className="space-y-2">
              <Label>{t("genres")}</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.genres.map((genre) => (
                  <span
                    key={genre}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {genre}
                    <button
                      type="button"
                      onClick={() => removeGenre(genre)}
                      className="text-primary/60 hover:text-primary"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={handleGenreKeyDown}
                placeholder={t("addGenrePlaceholder")}
              />
            </div>

            {/* Studios tag input */}
            <div className="space-y-2">
              <Label>{t("studios")}</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.studios.map((studio) => (
                  <span
                    key={studio}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {studio}
                    <button
                      type="button"
                      onClick={() => removeStudio(studio)}
                      className="text-primary/60 hover:text-primary"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                value={studioInput}
                onChange={(e) => setStudioInput(e.target.value)}
                onKeyDown={handleStudioKeyDown}
                placeholder={t("addStudioPlaceholder")}
              />
            </div>

            {/* Tags input */}
            <div className="space-y-2">
              <Label>{t("tags")}</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
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
                onKeyDown={handleTagKeyDown}
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

          <TabsContent value="cast" className="space-y-4 pt-4">
            {castEntries.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={entry.name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCastEntries((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, name: v } : c))
                    );
                  }}
                  placeholder={t("name")}
                />
                <Select
                  value={entry.type}
                  onValueChange={(v: CastEntry["type"]) => {
                    setCastEntries((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, type: v } : c))
                    );
                  }}
                >
                  <SelectTrigger className="h-9 w-[120px] rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3 text-sm text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actor">{t("actor")}</SelectItem>
                    <SelectItem value="director">{t("director")}</SelectItem>
                    <SelectItem value="writer">{t("writer")}</SelectItem>
                    <SelectItem value="producer">{t("producer")}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  value={entry.role}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCastEntries((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, role: v } : c))
                    );
                  }}
                  placeholder={t("role")}
                />
                <button
                  type="button"
                  onClick={() =>
                    setCastEntries((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setCastEntries((prev) => [
                  ...prev,
                  { name: "", type: "actor", role: "" },
                ])
              }
              className="w-full rounded-md border border-dashed border-white/20 py-2 text-sm text-muted-foreground hover:border-white/40 hover:text-foreground"
            >
              {t("addCast")}
            </button>
          </TabsContent>

          <TabsContent value="images" className="pt-4">
            <div className="flex flex-col sm:flex-row items-start gap-4">
              {/* Poster */}
              <div className="flex w-1/2 sm:w-[180px] flex-shrink-0 flex-col gap-2">
                <h3 className="text-xs font-medium text-white/50">{t("poster")}</h3>
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-white/[0.04] border border-white/[0.06]">
                  {movie?.posterPath ? (
                    <Image
                      src={resolveImageSrc(movie.posterPath)}
                      alt="Poster"
                      fill
                      className="object-cover"
                      sizes="180px"
                      key={movie.posterPath}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-white/30">
                      <ImageIcon className="h-8 w-8" />
                      <span className="text-xs">{t("noImage")}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => posterInputRef.current?.click()}
                    disabled={imgBusy}
                    className="h-7 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    {movie?.posterPath ? t("replaceImage") : t("uploadImage")}
                  </button>
                  {movie?.posterPath && (
                    <button
                      onClick={() => handleImageDelete("poster")}
                      disabled={imgBusy}
                      className="h-7 rounded-md border border-red-500/20 bg-red-500/10 px-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <input ref={posterInputRef} type="file" accept="image/*" className="hidden" onChange={onImageFileSelected("poster")} />
              </div>

              {/* Fanart */}
              <div className="flex w-full sm:min-w-0 sm:flex-1 flex-col gap-2">
                <h3 className="text-xs font-medium text-white/50">{t("fanart")}</h3>
                <div className="relative aspect-video sm:h-[250px] sm:aspect-auto w-full overflow-hidden rounded-md bg-white/[0.04] border border-white/[0.06]">
                  {movie?.fanartPath ? (
                    <Image
                      src={resolveImageSrc(movie.fanartPath)}
                      alt="Fanart"
                      fill
                      className="object-cover"
                      sizes="480px"
                      key={movie.fanartPath}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-white/30">
                      <ImageIcon className="h-8 w-8" />
                      <span className="text-xs">{t("noImage")}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => fanartInputRef.current?.click()}
                    disabled={imgBusy}
                    className="h-7 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 cursor-pointer"
                  >
                    {movie?.fanartPath ? t("replaceImage") : t("uploadImage")}
                  </button>
                  {movie?.fanartPath && (
                    <button
                      onClick={() => handleImageDelete("fanart")}
                      disabled={imgBusy}
                      className="h-7 rounded-md border border-red-500/20 bg-red-500/10 px-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <input ref={fanartInputRef} type="file" accept="image/*" className="hidden" onChange={onImageFileSelected("fanart")} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="personal" className="space-y-4 pt-4">
            {movieDimensions.length > 0 ? (
              <>
                {/* Per-dimension inputs */}
                {movieDimensions.map((dim) => (
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
                {/* Computed average display */}
                <div className="space-y-2 border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between">
                    <Label>{t("personalRating")}</Label>
                    {movieDimensions.some((d) => dimensionRatings[d] > 0) && (
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
                      const movieWeights = prefs?.movieDimensionWeights ?? {};
                      let ws = 0, wt = 0;
                      for (const d of movieDimensions) {
                        const v = dimensionRatings[d];
                        if (v != null && v > 0) { const w = movieWeights[d] ?? 1; ws += v * w; wt += w; }
                      }
                      return wt > 0 ? (ws / wt).toFixed(1) : "—";
                    })()}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("personalRatingDesc")}</p>
                </div>
              </>
            ) : (
              <>
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
                        type="button"
                        onClick={() => handleFine(-0.1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/70 text-xs transition-colors hover:bg-white/10"
                      >
                        −
                      </button>
                      <span className="min-w-[3rem] text-center text-xl font-bold text-[var(--gold)] tabular-nums">
                        {ratingNum != null && ratingNum > 0 ? ratingNum.toFixed(1) : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleFine(0.1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/70 text-xs transition-colors hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>

                    {/* Clear button */}
                    {ratingNum != null && ratingNum > 0 && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, personalRating: "" }))}
                        className="text-xs text-white/40 hover:text-white/70"
                      >
                        {t("clearRating")}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{t("personalRatingDesc")}</p>
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
    <GlassToast visible={!!toast} success={toast?.success} className="z-[100]">
      {toast?.text}
    </GlassToast>
    </>
  );
}

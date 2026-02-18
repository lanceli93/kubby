"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
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

interface MovieMetadataEditorProps {
  movieId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  tmdbId?: string;
  imdbId?: string;
}

export function MovieMetadataEditor({ movieId, open, onOpenChange }: MovieMetadataEditorProps) {
  const queryClient = useQueryClient();
  const t = useTranslations("metadata");
  const tCommon = useTranslations("common");

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
  });

  const [genreInput, setGenreInput] = useState("");
  const [studioInput, setStudioInput] = useState("");
  const [tagInput, setTagInput] = useState("");

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
      });
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

  const handleSave = () => {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.06] bg-black/70 backdrop-blur-xl sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editMetadata")}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">{t("general")}</TabsTrigger>
            <TabsTrigger value="external">{t("externalIds")}</TabsTrigger>
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
          </TabsContent>

          <TabsContent value="external" className="space-y-4 pt-4">
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

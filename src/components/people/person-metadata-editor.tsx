"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  });

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

  const handleSave = () => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.06] bg-card sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
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

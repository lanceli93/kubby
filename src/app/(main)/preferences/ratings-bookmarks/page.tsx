"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Upload, Trash2, ChevronUp, ChevronDown, Pencil, Plus, Minus } from "lucide-react";
import { GlassToast } from "@/components/ui/glass-toast";
import { useTranslations } from "next-intl";
import { BUILTIN_BOOKMARK_ICONS } from "@/lib/bookmark-icons";
import { resolveImageSrc } from "@/lib/image-utils";
import type { UserPreferences } from "@/hooks/use-user-preferences";

interface CustomIcon {
  id: string;
  label: string;
  imagePath: string;
  dotColor?: string;
}

const DOT_COLOR_OPTIONS = [
  { value: "#ffffff", label: "White" },
  { value: "#60a5fa", label: "Blue" },
  { value: "#facc15", label: "Yellow" },
  { value: "#f97316", label: "Orange" },
  { value: "#f87171", label: "Red" },
  { value: "#34d399", label: "Green" },
  { value: "#a78bfa", label: "Violet" },
  { value: "#c084fc", label: "Purple" },
];

export default function PersonalMetadataPage() {
  const t = useTranslations("personalMetadata");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery<UserPreferences>({
    queryKey: ["userPreferences"],
    queryFn: () =>
      fetch("/api/settings/personal-metadata").then((r) => r.json()),
  });

  const { data: customIcons = [] } = useQuery<CustomIcon[]>({
    queryKey: ["bookmark-icons"],
    queryFn: () => fetch("/api/settings/bookmark-icons").then((r) => r.json()),
  });

  const [movieDims, setMovieDims] = useState<string[]>([]);
  const [personDims, setPersonDims] = useState<string[]>([]);
  const [disabledIcons, setDisabledIcons] = useState<Set<string>>(new Set());
  const [subtleMarkers, setSubtleMarkers] = useState(false);
  const [qbIconType, setQbIconType] = useState("bookmark");
  const [qbTags, setQbTags] = useState<string[]>([]);
  const [qbNote, setQbNote] = useState("");
  const [qbTagInput, setQbTagInput] = useState("");
  const [movieInput, setMovieInput] = useState("");
  const [personInput, setPersonInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Dimension management state
  const [movieRenames, setMovieRenames] = useState<Record<string, string>>({});
  const [personRenames, setPersonRenames] = useState<Record<string, string>>({});
  const [editingDim, setEditingDim] = useState<{ type: "movie" | "person"; index: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [deletingDim, setDeletingDim] = useState<{ type: "movie" | "person"; index: number; name: string; count: number | null } | null>(null);
  const [movieWeights, setMovieWeights] = useState<Record<string, number>>({});
  const [personWeights, setPersonWeights] = useState<Record<string, number>>({});

  // Custom icon upload state
  const [iconLabel, setIconLabel] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconDotColor, setIconDotColor] = useState("#ffffff");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, success: boolean) => {
    clearTimeout(toastTimer.current);
    setToast({ text, success });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    if (prefs) {
      setMovieDims(prefs.movieRatingDimensions || []);
      setPersonDims(prefs.personRatingDimensions || []);
      setDisabledIcons(new Set(prefs.disabledBookmarkIcons || []));
      setSubtleMarkers(prefs.subtleBookmarkMarkers ?? false);
      const tpl = prefs.quickBookmarkTemplate;
      setQbIconType(tpl?.iconType || "bookmark");
      setQbTags(tpl?.tags || []);
      setQbNote(tpl?.note || "");
      setMovieWeights(prefs.movieDimensionWeights || {});
      setPersonWeights(prefs.personDimensionWeights || {});
    }
  }, [prefs]);

  const MAX_DIM_LENGTH = 20;

  const handleAddDim = (type: "movie" | "person") => {
    const input = type === "movie" ? movieInput : personInput;
    const dims = type === "movie" ? movieDims : personDims;
    const setDims = type === "movie" ? setMovieDims : setPersonDims;
    const setInput = type === "movie" ? setMovieInput : setPersonInput;
    if (!input.trim() || dims.length >= 10) return;
    const trimmed = input.trim().slice(0, MAX_DIM_LENGTH);
    if (!dims.includes(trimmed)) {
      setDims((d) => [...d, trimmed]);
    }
    setInput("");
  };

  const handleMoveDim = (type: "movie" | "person", index: number, direction: -1 | 1) => {
    const setDims = type === "movie" ? setMovieDims : setPersonDims;
    setDims((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const startEdit = (type: "movie" | "person", index: number) => {
    const dims = type === "movie" ? movieDims : personDims;
    setEditingDim({ type, index });
    setEditValue(dims[index]);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const commitEdit = () => {
    if (!editingDim) return;
    const { type, index } = editingDim;
    const dims = type === "movie" ? movieDims : personDims;
    const setDims = type === "movie" ? setMovieDims : setPersonDims;
    const setRenames = type === "movie" ? setMovieRenames : setPersonRenames;
    const trimmed = editValue.trim().slice(0, MAX_DIM_LENGTH);
    const oldName = dims[index];
    if (trimmed && trimmed !== oldName && !dims.includes(trimmed)) {
      setDims((prev) => prev.map((d, i) => (i === index ? trimmed : d)));
      // Rename weight key
      const setWeights = type === "movie" ? setMovieWeights : setPersonWeights;
      setWeights((prev) => {
        if (!(oldName in prev)) return prev;
        const updated = { ...prev, [trimmed]: prev[oldName] };
        delete updated[oldName];
        return updated;
      });
      // Track rename: find original name (may have been renamed before)
      setRenames((prev) => {
        const updated = { ...prev };
        const originalKey = Object.entries(updated).find(([, v]) => v === oldName)?.[0];
        if (originalKey) {
          updated[originalKey] = trimmed;
        } else {
          updated[oldName] = trimmed;
        }
        return updated;
      });
    }
    setEditingDim(null);
    setEditValue("");
  };

  const startDelete = async (type: "movie" | "person", index: number) => {
    const dims = type === "movie" ? movieDims : personDims;
    const name = dims[index];
    // If this dimension was renamed (unsaved), query by the original name in DB
    const renameMap = type === "movie" ? movieRenames : personRenames;
    const originalName = Object.entries(renameMap).find(([, v]) => v === name)?.[0] ?? name;
    setDeletingDim({ type, index, name, count: null });
    try {
      const res = await fetch(`/api/settings/dimension-usage?type=${type}&name=${encodeURIComponent(originalName)}`);
      const data = await res.json();
      setDeletingDim((prev) => prev ? { ...prev, count: data.count ?? 0 } : null);
    } catch {
      setDeletingDim((prev) => prev ? { ...prev, count: 0 } : null);
    }
  };

  const confirmDelete = () => {
    if (!deletingDim) return;
    const { type, index } = deletingDim;
    const dims = type === "movie" ? movieDims : personDims;
    const setDims = type === "movie" ? setMovieDims : setPersonDims;
    const setWeights = type === "movie" ? setMovieWeights : setPersonWeights;
    const name = dims[index];
    setDims((prev) => prev.filter((_, i) => i !== index));
    setWeights((prev) => {
      if (!(name in prev)) return prev;
      const updated = { ...prev };
      delete updated[name];
      return updated;
    });
    setDeletingDim(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const hasRenames = Object.keys(movieRenames).length > 0 || Object.keys(personRenames).length > 0;
      const res = await fetch("/api/settings/personal-metadata", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieRatingDimensions: movieDims,
          personRatingDimensions: personDims,
          movieDimensionWeights: movieWeights,
          personDimensionWeights: personWeights,
          disabledBookmarkIcons: Array.from(disabledIcons),
          subtleBookmarkMarkers: subtleMarkers,
          quickBookmarkTemplate: (qbIconType !== "bookmark" || qbTags.length > 0 || qbNote)
            ? { iconType: qbIconType, tags: qbTags, note: qbNote || undefined }
            : null,
          ...(hasRenames && {
            renamedDimensions: {
              ...(Object.keys(movieRenames).length > 0 && { movie: movieRenames }),
              ...(Object.keys(personRenames).length > 0 && { person: personRenames }),
            },
          }),
        }),
      });
      if (res.ok) {
        showToast(t("saved"), true);
        setMovieRenames({});
        setPersonRenames({});
        queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
      } else {
        showToast(t("failedToSave"), false);
      }
    } catch {
      showToast(t("failedToSave"), false);
    } finally {
      setSaving(false);
    }
  };

  const uploadIcon = useMutation({
    mutationFn: async ({ label, file, dotColor }: { label: string; file: File; dotColor: string }) => {
      const formData = new FormData();
      formData.append("label", label);
      formData.append("file", file);
      formData.append("dotColor", dotColor);
      const res = await fetch("/api/settings/bookmark-icons", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmark-icons"] });
      setIconLabel("");
      setIconFile(null);
      setIconDotColor("#ffffff");
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast(t("iconUploaded"), true);
    },
    onError: (err: Error) => {
      showToast(err.message, false);
    },
  });

  const updateIconColor = useMutation({
    mutationFn: async ({ iconId, dotColor }: { iconId: string; dotColor: string }) => {
      const icon = customIcons.find((c) => c.id === iconId);
      const res = await fetch(`/api/settings/bookmark-icons/${iconId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: icon?.label || "", dotColor }),
      });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmark-icons"] });
    },
  });

  const deleteIcon = useMutation({
    mutationFn: async (iconId: string) => {
      const res = await fetch(`/api/settings/bookmark-icons/${iconId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmark-icons"] });
      showToast(t("iconDeleted"), true);
    },
    onError: () => {
      showToast(t("failedToSave"), false);
    },
  });

  return (
    <div className="h-full overflow-y-scroll">
    <div className="stagger-children flex flex-col items-center gap-6 px-4 md:px-0 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("title")}</h1>

      {/* Movie Rating Dimensions */}
      <div className="flex w-full max-w-[720px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7">
        <h2 className="text-lg font-semibold text-foreground">
          {t("movieRatingDimensions")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("movieRatingDimensionsDesc")}
        </p>
        {movieDims.length > 0 && (
          <div className="flex flex-col gap-1">
            {movieDims.map((dim, i) => (
              <div
                key={`movie-${i}`}
                className="group flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 transition-fluid hover:bg-white/[0.07]"
              >
                <span className="w-5 text-center text-xs tabular-nums text-muted-foreground/50">{i + 1}</span>
                {editingDim?.type === "movie" && editingDim.index === i ? (
                  <input
                    ref={editInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") { setEditingDim(null); setEditValue(""); }
                    }}
                    onBlur={commitEdit}
                    maxLength={MAX_DIM_LENGTH}
                    className="h-7 flex-1 rounded-md border border-primary/50 bg-white/[0.05] px-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                ) : (
                  <span className="flex-1 text-sm text-foreground">{dim}</span>
                )}
                {/* Weight control */}
                <div className="flex items-center gap-0.5 rounded-md bg-white/[0.06] px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => setMovieWeights((prev) => ({ ...prev, [dim]: Math.max(0.5, (prev[dim] ?? 1) - 0.5) }))}
                    disabled={(movieWeights[dim] ?? 1) <= 0.5}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer transition-fluid"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className={`min-w-[2rem] text-center text-xs tabular-nums ${(movieWeights[dim] ?? 1) !== 1 ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    x{(movieWeights[dim] ?? 1).toFixed(1)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMovieWeights((prev) => ({ ...prev, [dim]: Math.min(3, (prev[dim] ?? 1) + 0.5) }))}
                    disabled={(movieWeights[dim] ?? 1) >= 3}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer transition-fluid"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleMoveDim("movie", i, -1)}
                    disabled={i === 0}
                    className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-20 cursor-pointer transition-fluid"
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDim("movie", i, 1)}
                    disabled={i === movieDims.length - 1}
                    className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-20 cursor-pointer transition-fluid"
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit("movie", i)}
                    className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground cursor-pointer transition-fluid"
                    aria-label="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startDelete("movie", i)}
                    className="rounded p-1 text-muted-foreground hover:bg-red-500/20 hover:text-red-400 cursor-pointer transition-fluid"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={movieInput}
            onChange={(e) => setMovieInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDim("movie"); } }}
            placeholder={t("addDimensionPlaceholder")}
            maxLength={MAX_DIM_LENGTH}
            disabled={movieDims.length >= 10}
            className="h-9 flex-1 rounded-md border border-white/[0.06] bg-white/[0.05] px-3 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => handleAddDim("movie")}
            disabled={movieDims.length >= 10 || !movieInput.trim()}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-muted-foreground transition-fluid hover:bg-white/15 hover:text-foreground active:scale-95 cursor-pointer disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {movieDims.length >= 10 && (
          <p className="text-xs text-muted-foreground">{t("maxDimensions")}</p>
        )}
      </div>

      {/* Person Rating Dimensions */}
      <div className="flex w-full max-w-[720px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7">
        <h2 className="text-lg font-semibold text-foreground">
          {t("personRatingDimensions")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("personRatingDimensionsDesc")}
        </p>
        {personDims.length > 0 && (
          <div className="flex flex-col gap-1">
            {personDims.map((dim, i) => (
              <div
                key={`person-${i}`}
                className="group flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 transition-fluid hover:bg-white/[0.07]"
              >
                <span className="w-5 text-center text-xs tabular-nums text-muted-foreground/50">{i + 1}</span>
                {editingDim?.type === "person" && editingDim.index === i ? (
                  <input
                    ref={editInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") { setEditingDim(null); setEditValue(""); }
                    }}
                    onBlur={commitEdit}
                    maxLength={MAX_DIM_LENGTH}
                    className="h-7 flex-1 rounded-md border border-primary/50 bg-white/[0.05] px-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                ) : (
                  <span className="flex-1 text-sm text-foreground">{dim}</span>
                )}
                {/* Weight control */}
                <div className="flex items-center gap-0.5 rounded-md bg-white/[0.06] px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => setPersonWeights((prev) => ({ ...prev, [dim]: Math.max(0.5, (prev[dim] ?? 1) - 0.5) }))}
                    disabled={(personWeights[dim] ?? 1) <= 0.5}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer transition-fluid"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className={`min-w-[2rem] text-center text-xs tabular-nums ${(personWeights[dim] ?? 1) !== 1 ? "text-primary font-medium" : "text-muted-foreground"}`}>
                    x{(personWeights[dim] ?? 1).toFixed(1)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPersonWeights((prev) => ({ ...prev, [dim]: Math.min(3, (prev[dim] ?? 1) + 0.5) }))}
                    disabled={(personWeights[dim] ?? 1) >= 3}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 cursor-pointer transition-fluid"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleMoveDim("person", i, -1)}
                    disabled={i === 0}
                    className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-20 cursor-pointer transition-fluid"
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDim("person", i, 1)}
                    disabled={i === personDims.length - 1}
                    className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-20 cursor-pointer transition-fluid"
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit("person", i)}
                    className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground cursor-pointer transition-fluid"
                    aria-label="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startDelete("person", i)}
                    className="rounded p-1 text-muted-foreground hover:bg-red-500/20 hover:text-red-400 cursor-pointer transition-fluid"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={personInput}
            onChange={(e) => setPersonInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDim("person"); } }}
            placeholder={t("addDimensionPlaceholder")}
            maxLength={MAX_DIM_LENGTH}
            disabled={personDims.length >= 10}
            className="h-9 flex-1 rounded-md border border-white/[0.06] bg-white/[0.05] px-3 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => handleAddDim("person")}
            disabled={personDims.length >= 10 || !personInput.trim()}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-muted-foreground transition-fluid hover:bg-white/15 hover:text-foreground active:scale-95 cursor-pointer disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {personDims.length >= 10 && (
          <p className="text-xs text-muted-foreground">{t("maxDimensions")}</p>
        )}
      </div>

      {/* Delete Dimension Confirmation */}
      {deletingDim && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#0a0a0f]/90 p-6 shadow-2xl backdrop-blur-2xl ring-1 ring-white/[0.06]">
            <h3 className="text-base font-semibold text-foreground">{t("deleteDimensionTitle")}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {deletingDim.count === null
                ? t("deleteDimensionLoading")
                : deletingDim.count > 0
                  ? t("deleteDimensionConfirm", { name: deletingDim.name, count: deletingDim.count, type: deletingDim.type === "movie" ? t("movies") : t("people") })
                  : t("deleteDimensionNoData", { name: deletingDim.name })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingDim(null)}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm text-muted-foreground transition-fluid hover:bg-white/15 hover:text-foreground cursor-pointer"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deletingDim.count === null}
                className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-fluid hover:bg-red-500/30 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {tCommon("delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bookmark Icons */}
      <div className="flex w-full max-w-[720px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("bookmarkIcons")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("iconEnabledHint")}
          </p>
        </div>

        {/* Built-in icons */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-white/[0.06]" />
          <span className="text-[11px] text-muted-foreground/50">{t("builtinIcons")}</span>
          <div className="flex-1 border-t border-white/[0.06]" />
        </div>
        <div className="flex flex-wrap gap-2">
          {BUILTIN_BOOKMARK_ICONS.map((bi) => {
            const Icon = bi.icon;
            const isDisabled = disabledIcons.has(bi.id);
            return (
              <button
                key={bi.id}
                type="button"
                onClick={() => {
                  setDisabledIcons((prev) => {
                    const next = new Set(prev);
                    if (next.has(bi.id)) next.delete(bi.id);
                    else next.add(bi.id);
                    return next;
                  });
                }}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-fluid cursor-pointer ${
                  isDisabled
                    ? "bg-white/5 opacity-30 line-through text-muted-foreground"
                    : "bg-white/5 text-muted-foreground hover:bg-white/10"
                }`}
              >
                <Icon className={`h-4 w-4 ${isDisabled ? "text-muted-foreground" : bi.color}`} />
                {t(`builtinIcon_${bi.id}`)}
              </button>
            );
          })}
        </div>

        {/* Custom icons — separated by labeled divider */}
        {customIcons.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-white/[0.06]" />
              <span className="text-[11px] text-muted-foreground/50">{t("customIcons")}</span>
              <div className="flex-1 border-t border-white/[0.06]" />
            </div>
            <div className="flex flex-wrap gap-2">
              {customIcons.map((ci) => {
                const isDisabled = disabledIcons.has(ci.id);
                return (
                  <div
                    key={ci.id}
                    className={`group/icon flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1.5 text-xs text-muted-foreground transition-all ${
                      isDisabled ? "opacity-30 line-through" : "hover:bg-white/10"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setDisabledIcons((prev) => {
                          const next = new Set(prev);
                          if (next.has(ci.id)) next.delete(ci.id);
                          else next.add(ci.id);
                          return next;
                        });
                      }}
                      className="flex items-center gap-1.5 cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveImageSrc(ci.imagePath)}
                        alt={ci.label}
                        className="h-4 w-4 object-contain"
                      />
                      {ci.label}
                    </button>
                    {/* Dot color cycler */}
                    <button
                      type="button"
                      onClick={() => {
                        const idx = DOT_COLOR_OPTIONS.findIndex((o) => o.value === (ci.dotColor || "#ffffff"));
                        const next = DOT_COLOR_OPTIONS[(idx + 1) % DOT_COLOR_OPTIONS.length];
                        updateIconColor.mutate({ iconId: ci.id, dotColor: next.value });
                      }}
                      className="h-3 w-3 rounded-full cursor-pointer ring-1 ring-white/20 hover:ring-white/50 transition-all"
                      style={{ backgroundColor: ci.dotColor || "#ffffff" }}
                      title={t("dotColor")}
                    />
                    <button
                      onClick={() => deleteIcon.mutate(ci.id)}
                      className="text-red-400/0 group-hover/icon:text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Upload custom icon */}
        {customIcons.length < 20 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("iconLabel")}
                </label>
                <input
                  value={iconLabel}
                  onChange={(e) => setIconLabel(e.target.value)}
                  placeholder={t("iconLabelPlaceholder")}
                  maxLength={20}
                  className="h-9 w-full rounded-md border border-white/[0.06] bg-white/[0.05] px-3 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex h-9 flex-1 items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setIconFile(file);
                    if (file && !iconLabel.trim()) {
                      const name = file.name.replace(/\.[^.]+$/, "");
                      setIconLabel(name);
                    }
                  }}
                  className="w-full text-xs text-muted-foreground file:mr-2 file:h-9 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:text-xs file:text-foreground file:cursor-pointer"
                />
              </div>
              <button
                onClick={() => {
                  if (iconLabel.trim() && iconFile) {
                    uploadIcon.mutate({ label: iconLabel.trim(), file: iconFile, dotColor: iconDotColor });
                  }
                }}
                disabled={!iconLabel.trim() || !iconFile || uploadIcon.isPending}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-fluid hover:bg-primary/90 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                {t("uploadIcon")}
              </button>
            </div>
            {/* Dot color picker */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("dotColor")}</span>
              {DOT_COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setIconDotColor(opt.value)}
                  className={`h-5 w-5 rounded-full cursor-pointer transition-all ${
                    iconDotColor === opt.value ? "ring-2 ring-white/70 ring-offset-1 ring-offset-black" : "hover:ring-1 hover:ring-white/30"
                  }`}
                  style={{ backgroundColor: opt.value }}
                  title={opt.label}
                />
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("iconFormatHint")} · {t("maxCustomIcons", { max: 20 })}
        </p>

        {/* Subtle bookmark markers toggle + preview */}
        <div className="border-t border-white/[0.06] pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{t("subtleMarkers")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("subtleMarkersDesc")}</p>
            </div>
            <button
              type="button"
              onClick={() => setSubtleMarkers((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-fluid cursor-pointer ${
                subtleMarkers ? "bg-primary" : "bg-white/20"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  subtleMarkers ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Preview */}
          <div className="mt-3 grid grid-cols-2 gap-4">
            {/* Normal preview */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground/60">{t("subtleMarkersOff")}</span>
              <div className="relative flex h-10 w-full items-end justify-center rounded bg-zinc-800">
                <div className="absolute bottom-1 left-1/3 flex flex-col items-center">
                  {(() => { const Icon = BUILTIN_BOOKMARK_ICONS[0].icon; return <Icon className="h-4 w-4" style={{ color: BUILTIN_BOOKMARK_ICONS[0].hexColor }} />; })()}
                  <div className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BUILTIN_BOOKMARK_ICONS[0].hexColor }} />
                </div>
                <div className="absolute bottom-1 left-2/3 flex flex-col items-center">
                  {(() => { const Icon = BUILTIN_BOOKMARK_ICONS[2].icon; return <Icon className="h-4 w-4" style={{ color: BUILTIN_BOOKMARK_ICONS[2].hexColor }} />; })()}
                  <div className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BUILTIN_BOOKMARK_ICONS[2].hexColor }} />
                </div>
                <div className="absolute bottom-0 h-[3px] w-full rounded-full bg-white/30" />
              </div>
            </div>
            {/* Subtle preview */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground/60">{t("subtleMarkersOn")}</span>
              <div className="relative flex h-10 w-full items-end justify-center rounded bg-zinc-800">
                <div className="absolute bottom-1 left-1/3 flex flex-col items-center opacity-40">
                  {(() => { const Icon = BUILTIN_BOOKMARK_ICONS[0].icon; return <Icon className="h-4 w-4 text-white" />; })()}
                  <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-white" />
                </div>
                <div className="absolute bottom-1 left-2/3 flex flex-col items-center opacity-40">
                  {(() => { const Icon = BUILTIN_BOOKMARK_ICONS[2].icon; return <Icon className="h-4 w-4 text-white" />; })()}
                  <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-white" />
                </div>
                <div className="absolute bottom-0 h-[3px] w-full rounded-full bg-white/30" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Bookmark Template */}
      <div className="flex w-full max-w-[720px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("quickBookmarkTemplate")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("quickBookmarkTemplateDesc")}
          </p>
        </div>

        {/* Icon type */}
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">{t("templateType")}</label>
          <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto p-0.5">
            {BUILTIN_BOOKMARK_ICONS.filter((bi) => !disabledIcons.has(bi.id)).map((bi) => {
              const BiIcon = bi.icon;
              return (
                <button
                  key={bi.id}
                  type="button"
                  onClick={() => setQbIconType(bi.id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                    qbIconType === bi.id
                      ? `${bi.bgSelected} ${bi.color} ring-1 ${bi.ringSelected}`
                      : "bg-white/10 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <BiIcon className="h-3.5 w-3.5" />
                  {t(`builtinIcon_${bi.id}`)}
                </button>
              );
            })}
            {customIcons.filter((ci) => !disabledIcons.has(ci.id)).map((ci) => (
              <button
                key={ci.id}
                type="button"
                onClick={() => setQbIconType(ci.id)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
                  qbIconType === ci.id
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
          <label className="mb-1.5 block text-sm text-muted-foreground">{t("templateTags")}</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {qbTags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs text-foreground"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => setQbTags(qbTags.filter((t2) => t2 !== tag))}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={qbTagInput}
            onChange={(e) => setQbTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && qbTagInput.trim()) {
                e.preventDefault();
                if (!qbTags.includes(qbTagInput.trim())) {
                  setQbTags([...qbTags, qbTagInput.trim()]);
                }
                setQbTagInput("");
              }
            }}
            placeholder={t("addDimensionPlaceholder")}
            className="w-full rounded-md border border-white/[0.06] bg-white/[0.05] px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
          />
        </div>

        {/* Note */}
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">{t("templateNote")}</label>
          <textarea
            value={qbNote}
            onChange={(e) => setQbNote(e.target.value)}
            placeholder={t("templateNotePlaceholder")}
            rows={2}
            className="w-full resize-none rounded-md border border-white/[0.06] bg-white/[0.05] px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full max-w-[720px] rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-fluid hover:bg-primary/90 active:scale-95 cursor-pointer disabled:opacity-50"
      >
        {saving ? tCommon("loading") : tCommon("save")}
      </button>

      <GlassToast visible={!!toast} success={toast?.success}>
        {toast?.text}
      </GlassToast>
    </div>
    </div>
  );
}

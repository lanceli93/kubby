"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Check, AlertCircle, Upload, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { BUILTIN_BOOKMARK_ICONS } from "@/lib/bookmark-icons";
import { resolveImageSrc } from "@/lib/image-utils";
import type { UserPreferences } from "@/hooks/use-user-preferences";

interface CustomIcon {
  id: string;
  label: string;
  imagePath: string;
}

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
  const [movieInput, setMovieInput] = useState("");
  const [personInput, setPersonInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Custom icon upload state
  const [iconLabel, setIconLabel] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
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
    }
  }, [prefs]);

  const MAX_DIM_LENGTH = 20;

  const handleMovieDimKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && movieInput.trim()) {
      e.preventDefault();
      if (movieDims.length >= 10) return;
      const trimmed = movieInput.trim().slice(0, MAX_DIM_LENGTH);
      if (!movieDims.includes(trimmed)) {
        setMovieDims((d) => [...d, trimmed]);
      }
      setMovieInput("");
    }
  };

  const handlePersonDimKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && personInput.trim()) {
      e.preventDefault();
      if (personDims.length >= 10) return;
      const trimmed = personInput.trim().slice(0, MAX_DIM_LENGTH);
      if (!personDims.includes(trimmed)) {
        setPersonDims((d) => [...d, trimmed]);
      }
      setPersonInput("");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/personal-metadata", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieRatingDimensions: movieDims,
          personRatingDimensions: personDims,
          disabledBookmarkIcons: Array.from(disabledIcons),
        }),
      });
      if (res.ok) {
        showToast(t("saved"), true);
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
    mutationFn: async ({ label, file }: { label: string; file: File }) => {
      const formData = new FormData();
      formData.append("label", label);
      formData.append("file", file);
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
      if (fileInputRef.current) fileInputRef.current.value = "";
      showToast(t("iconUploaded"), true);
    },
    onError: (err: Error) => {
      showToast(err.message, false);
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
    <div className="flex flex-col items-center gap-6 py-8">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>

      {/* Movie Rating Dimensions */}
      <div className="flex w-[720px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-7">
        <h2 className="text-lg font-semibold text-foreground">
          {t("movieRatingDimensions")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("movieRatingDimensionsDesc")}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-1">
          {movieDims.map((dim) => (
            <span
              key={dim}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {dim}
              <button
                type="button"
                onClick={() => setMovieDims((d) => d.filter((x) => x !== dim))}
                className="text-primary/60 hover:text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <input
          value={movieInput}
          onChange={(e) => setMovieInput(e.target.value)}
          onKeyDown={handleMovieDimKeyDown}
          placeholder={t("addDimensionPlaceholder")}
          maxLength={MAX_DIM_LENGTH}
          disabled={movieDims.length >= 10}
          className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
        />
        {movieDims.length >= 10 && (
          <p className="text-xs text-muted-foreground">{t("maxDimensions")}</p>
        )}
      </div>

      {/* Person Rating Dimensions */}
      <div className="flex w-[720px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-7">
        <h2 className="text-lg font-semibold text-foreground">
          {t("personRatingDimensions")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("personRatingDimensionsDesc")}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-1">
          {personDims.map((dim) => (
            <span
              key={dim}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {dim}
              <button
                type="button"
                onClick={() => setPersonDims((d) => d.filter((x) => x !== dim))}
                className="text-primary/60 hover:text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <input
          value={personInput}
          onChange={(e) => setPersonInput(e.target.value)}
          onKeyDown={handlePersonDimKeyDown}
          placeholder={t("addDimensionPlaceholder")}
          maxLength={MAX_DIM_LENGTH}
          disabled={personDims.length >= 10}
          className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
        />
        {personDims.length >= 10 && (
          <p className="text-xs text-muted-foreground">{t("maxDimensions")}</p>
        )}
      </div>

      {/* Bookmark Icons */}
      <div className="flex w-[720px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-7">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("bookmarkIcons")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("iconEnabledHint")}
          </p>
        </div>

        {/* Built-in icons */}
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
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-all cursor-pointer ${
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

        {/* Custom icons — separated by divider */}
        {customIcons.length > 0 && (
          <>
            <div className="border-t border-white/[0.06]" />
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
          <div className="flex items-end gap-3 border-t border-white/[0.06] pt-4">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("iconLabel")}
              </label>
              <input
                value={iconLabel}
                onChange={(e) => setIconLabel(e.target.value)}
                placeholder={t("iconLabelPlaceholder")}
                maxLength={20}
                className="h-9 w-full rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex-1">
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
                className="h-9 w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1.5 file:text-xs file:text-foreground file:cursor-pointer"
              />
            </div>
            <button
              onClick={() => {
                if (iconLabel.trim() && iconFile) {
                  uploadIcon.mutate({ label: iconLabel.trim(), file: iconFile });
                }
              }}
              disabled={!iconLabel.trim() || !iconFile || uploadIcon.isPending}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              {t("uploadIcon")}
            </button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {t("iconFormatHint")} · {t("maxCustomIcons", { max: 20 })}
        </p>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-[720px] rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? tCommon("loading") : tCommon("save")}
      </button>

      {/* Toast notification */}
      <div
        className={`fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm transition-all duration-300 ${
          toast
            ? "translate-y-0 opacity-100"
            : "translate-y-4 opacity-0 pointer-events-none"
        } ${
          toast?.success
            ? "border-green-500/20 bg-green-500/10 text-green-400"
            : "border-red-500/20 bg-red-500/10 text-red-400"
        }`}
      >
        {toast?.success ? (
          <Check className="h-4 w-4" />
        ) : (
          <AlertCircle className="h-4 w-4" />
        )}
        {toast?.text}
      </div>
    </div>
    </div>
  );
}

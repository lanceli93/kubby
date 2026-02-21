"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Check, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UserPreferences } from "@/hooks/use-user-preferences";

export default function PersonalMetadataPage() {
  const t = useTranslations("personalMetadata");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery<UserPreferences>({
    queryKey: ["userPreferences"],
    queryFn: () =>
      fetch("/api/settings/personal-metadata").then((r) => r.json()),
  });

  const [movieDims, setMovieDims] = useState<string[]>([]);
  const [personDims, setPersonDims] = useState<string[]>([]);
  const [movieInput, setMovieInput] = useState("");
  const [personInput, setPersonInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = (text: string, success: boolean) => {
    clearTimeout(toastTimer.current);
    setToast({ text, success });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    if (prefs) {
      setMovieDims(prefs.movieRatingDimensions || []);
      setPersonDims(prefs.personRatingDimensions || []);
    }
  }, [prefs]);

  const handleMovieDimKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && movieInput.trim()) {
      e.preventDefault();
      if (movieDims.length >= 10) return;
      if (!movieDims.includes(movieInput.trim())) {
        setMovieDims((d) => [...d, movieInput.trim()]);
      }
      setMovieInput("");
    }
  };

  const handlePersonDimKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && personInput.trim()) {
      e.preventDefault();
      if (personDims.length >= 10) return;
      if (!personDims.includes(personInput.trim())) {
        setPersonDims((d) => [...d, personInput.trim()]);
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

  return (
    <div className="h-full overflow-y-scroll">
    <div className="flex flex-col items-center gap-6 py-8">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>

      {/* Movie Rating Dimensions */}
      <div className="flex w-[720px] flex-col gap-4 rounded-xl border border-white/[0.03] bg-card p-7">
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
          disabled={movieDims.length >= 10}
          className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
        />
        {movieDims.length >= 10 && (
          <p className="text-xs text-muted-foreground">{t("maxDimensions")}</p>
        )}
      </div>

      {/* Person Rating Dimensions */}
      <div className="flex w-[720px] flex-col gap-4 rounded-xl border border-white/[0.03] bg-card p-7">
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
          disabled={personDims.length >= 10}
          className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
        />
        {personDims.length >= 10 && (
          <p className="text-xs text-muted-foreground">{t("maxDimensions")}</p>
        )}
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

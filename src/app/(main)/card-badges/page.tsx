"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UserPreferences } from "@/hooks/use-user-preferences";

export default function CardBadgesPage() {
  const t = useTranslations("cardBadges");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery<UserPreferences>({
    queryKey: ["userPreferences"],
    queryFn: () =>
      fetch("/api/settings/personal-metadata").then((r) => r.json()),
  });

  const [showMovieBadge, setShowMovieBadge] = useState(true);
  const [showResolutionBadge, setShowResolutionBadge] = useState(true);
  const [showPersonBadge, setShowPersonBadge] = useState(true);
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
      setShowMovieBadge(prefs.showMovieRatingBadge);
      setShowResolutionBadge(prefs.showResolutionBadge);
      setShowPersonBadge(prefs.showPersonTierBadge);
    }
  }, [prefs]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/personal-metadata", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showMovieRatingBadge: showMovieBadge,
          showResolutionBadge: showResolutionBadge,
          showPersonTierBadge: showPersonBadge,
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
    <div className="flex flex-col items-center gap-6 py-8">
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>

      {/* Movie card badges */}
      <div className="flex w-[720px] flex-col gap-5 rounded-xl border border-white/[0.03] bg-card p-7">
        <h2 className="text-lg font-semibold text-foreground">
          {t("movieCardBadges")}
        </h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("showMovieRatingBadge")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("showMovieRatingBadgeDesc")}
            </p>
          </div>
          <button
            onClick={() => setShowMovieBadge(!showMovieBadge)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showMovieBadge ? "bg-primary" : "bg-white/20"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showMovieBadge ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("showResolutionBadge")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("showResolutionBadgeDesc")}
            </p>
          </div>
          <button
            onClick={() => setShowResolutionBadge(!showResolutionBadge)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showResolutionBadge ? "bg-primary" : "bg-white/20"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showResolutionBadge ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Person card badges */}
      <div className="flex w-[720px] flex-col gap-5 rounded-xl border border-white/[0.03] bg-card p-7">
        <h2 className="text-lg font-semibold text-foreground">
          {t("personCardBadges")}
        </h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("showPersonTierBadge")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("showPersonTierBadgeDesc")}
            </p>
          </div>
          <button
            onClick={() => setShowPersonBadge(!showPersonBadge)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showPersonBadge ? "bg-primary" : "bg-white/20"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showPersonBadge ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
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
  );
}

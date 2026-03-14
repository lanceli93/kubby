"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, AlertCircle, ChevronDown, Film, User } from "lucide-react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UserPreferences } from "@/hooks/use-user-preferences";
import {
  getTier,
  getTierColor,
  getTierBorderColor,
  getTierGlow,
  type Tier,
} from "@/lib/tier";

/* ── Resolution rules (mirrors getResolutionLabel in movie-card.tsx) ── */
const RESOLUTION_RULES: { min: number; unit: "width" | "height"; label: string }[] = [
  { min: 8000, unit: "width", label: "8K" },
  { min: 7000, unit: "width", label: "7K" },
  { min: 6000, unit: "width", label: "6K" },
  { min: 5000, unit: "width", label: "5K" },
  { min: 3500, unit: "width", label: "4K" },
  { min: 3000, unit: "width", label: "3K" },
  { min: 2500, unit: "width", label: "2K" },
  { min: 1920, unit: "width", label: "FHD" },
  { min: 1280, unit: "width", label: "HD" },
  { min: 576, unit: "height", label: "576P" },
  { min: 480, unit: "height", label: "480P" },
  { min: 360, unit: "height", label: "360P" },
  { min: 0, unit: "height", label: "240P" },
];

/* ── Tier rules ── */
const TIER_RULES: { minRating: number; tier: Tier }[] = [
  { minRating: 9.5, tier: "SSS" },
  { minRating: 9.0, tier: "SS" },
  { minRating: 8.5, tier: "S" },
  { minRating: 8.0, tier: "A" },
  { minRating: 7.0, tier: "B" },
  { minRating: 6.0, tier: "C" },
  { minRating: 5.0, tier: "D" },
  { minRating: 0, tier: "E" },
];

/* ── Abstract poster placeholder ── */
function PosterPlaceholder({
  icon,
  className,
}: {
  icon: "movie" | "person";
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-[4px] ${className}`}
      style={{
        background:
          icon === "movie"
            ? "linear-gradient(135deg, #334155 0%, #6b21a8 100%)"
            : "linear-gradient(135deg, #1e3a5f 0%, #4c1d95 100%)",
      }}
    >
      {icon === "movie" ? (
        <Film className="h-8 w-8 text-white/30" />
      ) : (
        <User className="h-8 w-8 text-white/30" />
      )}
    </div>
  );
}

/* ── Movie card preview ── */
function MovieCardPreview({
  showResolution,
  showRating,
  resolutionLabel,
  ratingValue,
}: {
  showResolution: boolean;
  showRating: boolean;
  resolutionLabel: string;
  ratingValue: number;
}) {
  return (
    <div className="relative" style={{ width: 120, height: 180 }}>
      <PosterPlaceholder icon="movie" className="h-full w-full" />

      {/* Resolution badge — top-left */}
      {showResolution && (
        <div className="absolute left-1.5 top-1.5 rounded border border-white/30 bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90">
          {resolutionLabel}
        </div>
      )}

      {/* Rating badge — top-right */}
      {showRating && (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5">
          <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
          <span className="text-[11px] font-medium text-[var(--gold)]">
            {ratingValue.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Person card preview ── */
function PersonCardPreview({
  showTier,
  showRating,
  rating,
}: {
  showTier: boolean;
  showRating: boolean;
  rating: number;
}) {
  const tier = getTier(rating);
  return (
    <div className="relative" style={{ width: 120, height: 180 }}>
      <PosterPlaceholder icon="person" className="h-full w-full" />

      {/* Tier badge — top-left */}
      {showTier && (
        <div
          className={`absolute left-1.5 top-1.5 rounded border bg-black/60 px-1.5 py-0.5 text-[11px] font-black tracking-wider ${getTierColor(tier)} ${getTierBorderColor(tier)} ${getTierGlow(tier)}`}
        >
          {tier}
        </div>
      )}

      {/* Personal rating badge — top-right */}
      {showRating && (
        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5">
          <Star className="h-3 w-3 fill-[var(--gold)] text-[var(--gold)]" />
          <span className="text-[11px] font-medium text-[var(--gold)]">
            {rating.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Expandable rules section ── */
function ExpandableRules({
  children,
  viewLabel,
  hideLabel,
}: {
  children: React.ReactNode;
  viewLabel: string;
  hideLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
        />
        {open ? hideLabel : viewLabel}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Main page ── */
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
  const [showPersonRatingBadge, setShowPersonRatingBadge] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    success: boolean;
  } | null>(null);
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
      setShowPersonRatingBadge(prefs.showPersonRatingBadge);
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
          showPersonRatingBadge: showPersonRatingBadge,
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
    <div className="stagger-children flex flex-col items-center gap-6 px-4 md:px-0 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("title")}</h1>

      {/* Movie card badges */}
      <div className="flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl p-7">
        <h2 className="text-lg font-semibold text-foreground">
          {t("movieCardBadges")}
        </h2>

        {/* Movie card previews */}
        <div className="flex items-center justify-center gap-8 rounded-lg border border-white/[0.06] bg-white/[0.02] py-5">
          <MovieCardPreview
            showResolution={showResolutionBadge}
            showRating={showMovieBadge}
            resolutionLabel="4K"
            ratingValue={9.5}
          />
          <MovieCardPreview
            showResolution={showResolutionBadge}
            showRating={showMovieBadge}
            resolutionLabel="FHD"
            ratingValue={8.5}
          />
        </div>

        {/* Rating badge toggle */}
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

        {/* Resolution badge toggle + expandable rules */}
        <div>
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

          <ExpandableRules
            viewLabel={t("viewRules")}
            hideLabel={t("hideRules")}
          >
            <p className="mb-2 text-xs font-medium text-foreground">
              {t("resolutionRulesTitle")}
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
              {RESOLUTION_RULES.map(({ min, unit, label }) => (
                <div
                  key={label}
                  className="flex items-center justify-between text-xs text-muted-foreground"
                >
                  <span>
                    {min > 0
                      ? `${unit === "width" ? t("width") : t("height")} ≥ ${min}px`
                      : `${t("height")} < 360px`}
                  </span>
                  <span className="font-mono font-semibold text-foreground">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </ExpandableRules>
        </div>
      </div>

      {/* Person card badges */}
      <div className="flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl p-7">
        <h2 className="text-lg font-semibold text-foreground">
          {t("personCardBadges")}
        </h2>

        {/* Person card previews */}
        <div className="flex items-center justify-center gap-8 rounded-lg border border-white/[0.06] bg-white/[0.02] py-5">
          <PersonCardPreview
            showTier={showPersonBadge}
            showRating={showPersonRatingBadge}
            rating={9.5}
          />
          <PersonCardPreview
            showTier={showPersonBadge}
            showRating={showPersonRatingBadge}
            rating={8.5}
          />
        </div>

        {/* Personal rating badge toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("showPersonRatingBadge")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("showPersonRatingBadgeDesc")}
            </p>
          </div>
          <button
            onClick={() => setShowPersonRatingBadge(!showPersonRatingBadge)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showPersonRatingBadge ? "bg-primary" : "bg-white/20"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showPersonRatingBadge ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Tier badge toggle + expandable rules */}
        <div>
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

          <ExpandableRules
            viewLabel={t("viewRules")}
            hideLabel={t("hideRules")}
          >
            <p className="mb-2 text-xs font-medium text-foreground">
              {t("tierRulesTitle")}
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
              {TIER_RULES.map(({ minRating, tier }) => (
                <div
                  key={tier}
                  className="flex items-center justify-between text-xs text-muted-foreground"
                >
                  <span>
                    {minRating > 0 ? `≥ ${minRating.toFixed(1)}` : `< 5.0`}
                  </span>
                  <span
                    className={`font-mono font-black tracking-wider ${getTierColor(tier)}`}
                  >
                    {tier}
                  </span>
                </div>
              ))}
            </div>
          </ExpandableRules>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full max-w-[720px] rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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

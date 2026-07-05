"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { GlassToast } from "@/components/ui/glass-toast";
import { HeroMosaic, type MosaicMovie } from "@/components/home/hero-mosaic";
import {
  type HeroMosaicConfig,
  type MosaicStyle,
  type MosaicAngle,
  DEFAULT_HERO_MOSAIC_CONFIG,
  MOSAIC_ANGLES,
} from "@/lib/hero-mosaic-config";
import type { UserPreferences } from "@/hooks/use-user-preferences";

interface Library {
  id: string;
  name: string;
  movieCount?: number;
}

const STYLE_OPTIONS: MosaicStyle[] = ["poster", "fanart", "both"];
const ANGLE_OPTIONS: MosaicAngle[] = ["flat", "gentle", "classic", "steep", "reverse"];
// Minimum-resolution presets — null (Any) plus the widths the endpoint filters on.
const RESOLUTION_OPTIONS: { value: number | null; key: string }[] = [
  { value: null, key: "resAny" },
  { value: 1280, key: "HD" },
  { value: 1920, key: "FHD" },
  { value: 2500, key: "2K" },
  { value: 3500, key: "4K" },
];

/** A muted-glass segmented button — shared by the style / resolution pickers. */
function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-sm transition-fluid cursor-pointer ${
        active
          ? "bg-primary/25 border-primary/50 text-foreground"
          : "border-white/10 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function HeroMosaicPage() {
  const t = useTranslations("heroMosaic");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();

  const { data: prefs } = useQuery<UserPreferences>({
    queryKey: ["userPreferences"],
    queryFn: () =>
      fetch("/api/settings/personal-metadata").then((r) => r.json()),
  });

  const { data: libraries = [] } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
  });

  // Draft config (mirrors card-badges hydration pattern). Custom-mix toggle is
  // separate state: when OFF the sent/saved libraryWeights is {} (default mode).
  const [draft, setDraft] = useState<HeroMosaicConfig>(DEFAULT_HERO_MOSAIC_CONFIG);
  const [customWeights, setCustomWeights] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = (text: string, success: boolean) => {
    clearTimeout(toastTimer.current);
    setToast({ text, success });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    if (prefs?.heroMosaicConfig) {
      setDraft(prefs.heroMosaicConfig);
      setCustomWeights(
        Object.keys(prefs.heroMosaicConfig.libraryWeights ?? {}).length > 0
      );
    }
  }, [prefs]);

  const patch = (p: Partial<HeroMosaicConfig>) => setDraft((d) => ({ ...d, ...p }));

  const setLibWeight = (id: string, w: number) =>
    setDraft((d) => ({ ...d, libraryWeights: { ...d.libraryWeights, [id]: w } }));

  // The weights actually in effect (for preview + save): {} when custom is off.
  const effectiveWeights: Record<string, number> = customWeights
    ? Object.fromEntries(
        libraries.map((lib) => [lib.id, draft.libraryWeights[lib.id] ?? 50])
      )
    : {};

  // The sum of the (effective) weights, used for the % readout.
  const weightSum = Object.values(effectiveWeights).reduce((s, w) => s + w, 0);

  // Preview pool — keyed on the DATA-affecting draft fields only (columns/angle
  // re-render the same movies, so they stay OUT of the key). placeholderData
  // keeps the previous wall on screen while a new draw refetches (no flash).
  const { data: previewMovies = [] } = useQuery<MosaicMovie[]>({
    queryKey: [
      "movies",
      "hero-wall",
      "preview",
      draft.style,
      draft.yearFrom,
      draft.yearTo,
      draft.minWidth,
      JSON.stringify(effectiveWeights),
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("style", draft.style);
      params.set("yearFrom", draft.yearFrom === null ? "" : String(draft.yearFrom));
      params.set("yearTo", draft.yearTo === null ? "" : String(draft.yearTo));
      params.set("minWidth", draft.minWidth === null ? "" : String(draft.minWidth));
      // URLSearchParams encodes on toString() — no manual encodeURIComponent,
      // or the server decodes once and JSON.parse gets a still-escaped string.
      params.set("weights", JSON.stringify(effectiveWeights));
      params.set("limit", "60");
      return fetch(`/api/movies/hero-wall?${params.toString()}`).then((r) => r.json());
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const config: HeroMosaicConfig = {
        ...draft,
        libraryWeights: effectiveWeights,
      };
      const res = await fetch("/api/settings/personal-metadata", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heroMosaicConfig: config }),
      });
      if (res.ok) {
        showToast(t("saved"), true);
        queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
        queryClient.invalidateQueries({ queryKey: ["movies", "hero-wall"] });
      } else {
        showToast(t("failedToSave"), false);
      }
    } catch {
      showToast(t("failedToSave"), false);
    } finally {
      setSaving(false);
    }
  };

  const cardClass =
    "flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7";

  return (
    <div className="h-full overflow-y-scroll">
      <div className="stagger-children flex flex-col items-center gap-6 px-4 md:px-0 py-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("title")}</h1>

        {/* Live preview */}
        <div className={`${cardClass} max-w-[900px]`}>
          <h2 className="text-lg font-semibold text-foreground">{t("preview")}</h2>
          <div className="relative aspect-[21/9] overflow-hidden rounded-lg bg-[#0a0a0f]">
            {previewMovies.length >= 8 ? (
              <HeroMosaic
                movies={previewMovies}
                config={draft}
                featuredEnabled={false}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {t("previewTooFew")}
              </div>
            )}
            {/* Bottom gradient mimicking the real home hero. */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent" />
          </div>
        </div>

        {/* Layout: columns + style + angle */}
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-foreground">{t("layout")}</h2>

          {/* Column count */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{t("columnCount")}</p>
                <p className="text-xs text-muted-foreground">{t("columnCountDesc")}</p>
              </div>
              <span className="font-mono text-sm font-semibold text-foreground">
                {draft.columnCount}
              </span>
            </div>
            <input
              type="range"
              min={8}
              max={24}
              step={1}
              value={draft.columnCount}
              onChange={(e) => patch({ columnCount: Number(e.target.value) })}
              className="w-full cursor-pointer accent-primary"
              style={{ accentColor: "var(--primary)" }}
            />
          </div>

          {/* Style */}
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("style")}</p>
            <div className="flex flex-wrap gap-2">
              {STYLE_OPTIONS.map((s) => (
                <SegButton
                  key={s}
                  active={draft.style === s}
                  onClick={() => patch({ style: s })}
                >
                  {t(
                    s === "poster"
                      ? "stylePoster"
                      : s === "fanart"
                        ? "styleFanart"
                        : "styleBoth"
                  )}
                </SegButton>
              ))}
            </div>
          </div>

          {/* Angle */}
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("angle")}</p>
            <div className="flex flex-wrap gap-3">
              {ANGLE_OPTIONS.map((a) => {
                const active = draft.angle === a;
                return (
                  <button
                    key={a}
                    onClick={() => patch({ angle: a })}
                    className="flex flex-col items-center gap-1.5 cursor-pointer"
                  >
                    <div
                      className={`h-[40px] w-[64px] overflow-hidden rounded-md border transition-fluid ${
                        active
                          ? "border-primary/50 ring-2 ring-primary/50"
                          : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div
                        className="flex h-full w-full items-center justify-center gap-0.5 [transform-origin:center]"
                        style={{
                          transform: MOSAIC_ANGLES[a].replace("1600px", "300px"),
                        }}
                      >
                        <div className="h-6 w-2 rounded-sm bg-white/20" />
                        <div className="h-6 w-2 rounded-sm bg-white/20" />
                        <div className="h-6 w-2 rounded-sm bg-white/20" />
                      </div>
                    </div>
                    <span
                      className={`text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {t(
                        a === "flat"
                          ? "angleFlat"
                          : a === "gentle"
                            ? "angleGentle"
                            : a === "classic"
                              ? "angleClassic"
                              : a === "steep"
                                ? "angleSteep"
                                : "angleReverse"
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Library weights */}
        <div className={cardClass}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{t("libraryWeights")}</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("customWeights")}</span>
              <button
                onClick={() => setCustomWeights((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-fluid cursor-pointer ${
                  customWeights ? "bg-primary" : "bg-white/20"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    customWeights ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("libraryWeightsDesc")}</p>

          <div className="flex flex-col gap-4">
            {libraries.map((lib) => {
              const w = draft.libraryWeights[lib.id] ?? 50;
              const pct =
                !customWeights || weightSum === 0
                  ? "—"
                  : `${Math.round((w / weightSum) * 100)}%`;
              return (
                <div key={lib.id}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-foreground">{lib.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t("movieCount", { count: lib.movieCount ?? 0 })}
                      </span>
                    </div>
                    <span className="font-mono text-sm text-muted-foreground">{pct}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={w}
                    disabled={!customWeights}
                    onChange={(e) => setLibWeight(lib.id, Number(e.target.value))}
                    className="w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ accentColor: "var(--primary)" }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-foreground">{t("filters")}</h2>

          {/* Year range */}
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("yearRange")}</p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                {t("yearFrom")}
                <input
                  type="number"
                  min={1900}
                  max={2100}
                  placeholder="—"
                  value={draft.yearFrom ?? ""}
                  onChange={(e) =>
                    patch({
                      yearFrom: e.target.value === "" ? null : parseInt(e.target.value, 10),
                    })
                  }
                  className="w-24 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none transition-fluid focus:border-primary/50"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                {t("yearTo")}
                <input
                  type="number"
                  min={1900}
                  max={2100}
                  placeholder="—"
                  value={draft.yearTo ?? ""}
                  onChange={(e) =>
                    patch({
                      yearTo: e.target.value === "" ? null : parseInt(e.target.value, 10),
                    })
                  }
                  className="w-24 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground outline-none transition-fluid focus:border-primary/50"
                />
              </label>
            </div>
          </div>

          {/* Min resolution */}
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("minResolution")}</p>
            <div className="flex flex-wrap gap-2">
              {RESOLUTION_OPTIONS.map((opt) => (
                <SegButton
                  key={opt.key}
                  active={draft.minWidth === opt.value}
                  onClick={() => patch({ minWidth: opt.value })}
                >
                  {opt.value === null ? t("resAny") : opt.key}
                </SegButton>
              ))}
            </div>
          </div>
        </div>

        {/* Save */}
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

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
  type MosaicFlow,
  DEFAULT_HERO_MOSAIC_CONFIG,
  MOSAIC_ANGLES,
} from "@/lib/hero-mosaic-config";
import {
  type PeopleMosaicConfig,
  type PersonMosaicTier,
  DEFAULT_PEOPLE_MOSAIC_CONFIG,
  PERSON_MOSAIC_TIERS,
} from "@/lib/people-mosaic-config";
import type { UserPreferences } from "@/hooks/use-user-preferences";
import { useCurrentDomain } from "@/hooks/use-current-domain";
import { getTierColor, getTierBorderColor, type Tier } from "@/lib/tier";

interface Library {
  id: string;
  name: string;
  type: string;
  movieCount?: number;
}

// A single entry from /api/people/hero-wall — a person photo or gallery image.
// Maps to a MosaicMovie for the preview (title = name).
interface WallEntry {
  id: string;
  personId: string;
  name: string;
  type: string;
  posterPath: string | null;
  fanartPath: string | null;
  posterBlur: string | null;
  // True width/height ratios so preview tiles size to the image (no crop).
  posterAspect: number | null;
  fanartAspect: number | null;
  birthYear: number | null;
  movieCount: number;
  personalRating: number | null;
  isFavorite: boolean;
}

const STYLE_OPTIONS: MosaicStyle[] = ["poster", "fanart", "both"];
const ANGLE_OPTIONS: MosaicAngle[] = ["flat", "gentle", "classic", "steep", "reverse"];
const FLOW_OPTIONS: MosaicFlow[] = ["vertical", "horizontal"];
// Rating tiers available on the people wall — [] selection means "all".
const TIER_OPTIONS: PersonMosaicTier[] = PERSON_MOSAIC_TIERS;
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

/** A section divider heading — reads as a labelled group above a batch of cards. */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full max-w-[720px] items-center gap-3 pt-2">
      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {children}
      </h2>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

const cardClass =
  "flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7";

/** The poster-wall config editor — preview + layout + per-library weights +
 *  filters. Shared by the Movie Wall and the TV Wall (both persist a
 *  HeroMosaicConfig against a domain-filtered library set). All state lives in
 *  the parent; this is a pure controlled view so each wall stays independent. */
function WallEditor({
  draft,
  patch,
  setLibWeight,
  customWeights,
  setCustomWeights,
  libraries,
  effectiveWeights,
  weightSum,
  previewMovies,
  libraryCountLabel,
}: {
  draft: HeroMosaicConfig;
  patch: (p: Partial<HeroMosaicConfig>) => void;
  setLibWeight: (id: string, w: number) => void;
  customWeights: boolean;
  setCustomWeights: React.Dispatch<React.SetStateAction<boolean>>;
  libraries: Library[];
  effectiveWeights: Record<string, number>;
  weightSum: number;
  previewMovies: MosaicMovie[];
  libraryCountLabel: (count: number) => string;
}) {
  const t = useTranslations("heroMosaic");

  return (
    <>
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

      {/* Layout: flow + columns + style + angle */}
      <div className={cardClass}>
        <h2 className="text-lg font-semibold text-foreground">{t("layout")}</h2>

        {/* Flow (scroll direction) — client-only re-render, so it stays OUT of
            the preview queryKey (same as columnCount/angle). */}
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">{t("flow")}</p>
          <div className="flex flex-wrap gap-2">
            {FLOW_OPTIONS.map((f) => (
              <SegButton
                key={f}
                active={draft.flow === f}
                onClick={() => patch({ flow: f })}
              >
                {t(f === "vertical" ? "flowVertical" : "flowHorizontal")}
              </SegButton>
            ))}
          </div>
        </div>

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
                      {libraryCountLabel(lib.movieCount ?? 0)}
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
    </>
  );
}

export default function HeroMosaicPage() {
  const t = useTranslations("heroMosaic");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const domain = useCurrentDomain();

  const { data: prefs } = useQuery<UserPreferences>({
    queryKey: ["userPreferences"],
    queryFn: () =>
      fetch("/api/settings/personal-metadata").then((r) => r.json()),
  });

  const { data: allLibraries = [] } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
  });
  // The hero mosaic is the cinema home wall — its per-library weight mix must
  // only offer cinema-domain libraries. Positive allowlist (=== "movie"), never
  // a blacklist, so photo/music libraries can't leak into the mix.
  const libraries = allLibraries.filter((lib) => lib.type === "movie");
  // The TV Wall is the TV-domain twin — its mix must only offer tvshow
  // libraries. Same positive allowlist, so cinema/photo/music can't leak in.
  const tvLibraries = allLibraries.filter((lib) => lib.type === "tvshow");

  // Draft config (mirrors card-badges hydration pattern). Custom-mix toggle is
  // separate state: when OFF the sent/saved libraryWeights is {} (default mode).
  const [draft, setDraft] = useState<HeroMosaicConfig>(DEFAULT_HERO_MOSAIC_CONFIG);
  const [customWeights, setCustomWeights] = useState(false);
  // TV-wall draft — independent config, hydrated alongside the movie draft.
  const [tvDraft, setTvDraft] = useState<HeroMosaicConfig>(DEFAULT_HERO_MOSAIC_CONFIG);
  const [tvCustomWeights, setTvCustomWeights] = useState(false);
  // People-wall draft — independent config, hydrated alongside the movie draft.
  const [peopleDraft, setPeopleDraft] = useState<PeopleMosaicConfig>(
    DEFAULT_PEOPLE_MOSAIC_CONFIG
  );
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
    if (prefs?.tvHeroMosaicConfig) {
      setTvDraft(prefs.tvHeroMosaicConfig);
      setTvCustomWeights(
        Object.keys(prefs.tvHeroMosaicConfig.libraryWeights ?? {}).length > 0
      );
    }
    if (prefs?.peopleMosaicConfig) {
      setPeopleDraft(prefs.peopleMosaicConfig);
    }
  }, [prefs]);

  const patch = (p: Partial<HeroMosaicConfig>) => setDraft((d) => ({ ...d, ...p }));
  const patchTv = (p: Partial<HeroMosaicConfig>) => setTvDraft((d) => ({ ...d, ...p }));
  const patchPeople = (p: Partial<PeopleMosaicConfig>) =>
    setPeopleDraft((d) => ({ ...d, ...p }));

  const setLibWeight = (id: string, w: number) =>
    setDraft((d) => ({ ...d, libraryWeights: { ...d.libraryWeights, [id]: w } }));
  const setTvLibWeight = (id: string, w: number) =>
    setTvDraft((d) => ({ ...d, libraryWeights: { ...d.libraryWeights, [id]: w } }));

  // The weights actually in effect (for preview + save): {} when custom is off.
  const effectiveWeights: Record<string, number> = customWeights
    ? Object.fromEntries(
        libraries.map((lib) => [lib.id, draft.libraryWeights[lib.id] ?? 50])
      )
    : {};
  const tvEffectiveWeights: Record<string, number> = tvCustomWeights
    ? Object.fromEntries(
        tvLibraries.map((lib) => [lib.id, tvDraft.libraryWeights[lib.id] ?? 50])
      )
    : {};

  // The sum of the (effective) weights, used for the % readout.
  const weightSum = Object.values(effectiveWeights).reduce((s, w) => s + w, 0);
  const tvWeightSum = Object.values(tvEffectiveWeights).reduce((s, w) => s + w, 0);

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

  // TV preview pool — mirrors the movie preview, against /api/tv/hero-wall. That
  // endpoint returns a plain random draw (no year/resolution/weight filtering —
  // TV shows carry none per-title), so only `limit` rides the query; style/angle
  // etc. shape the client-side mosaic layout, not the pool. placeholderData
  // keeps the previous wall on screen while a new draw refetches.
  const { data: previewTvMovies = [] } = useQuery<MosaicMovie[]>({
    queryKey: ["tv-shows", "hero-wall", "preview"],
    queryFn: () =>
      fetch("/api/tv/hero-wall?limit=60").then((r) => r.json()),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  // People preview pool — keyed on the DATA-affecting people-draft fields only
  // (columns/angle/flow re-render the same entries, so they stay OUT of the key,
  // mirroring the movie preview). placeholderData keeps the previous wall on
  // screen while a new draw refetches.
  const { data: previewPeople = [] } = useQuery<WallEntry[]>({
    queryKey: [
      "people",
      "hero-wall",
      "preview",
      peopleDraft.includeFanart,
      peopleDraft.includeGallery,
      peopleDraft.galleryCount,
      peopleDraft.tiers.join(","),
      peopleDraft.favoritesOnly,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("includeFanart", String(peopleDraft.includeFanart));
      params.set("includeGallery", String(peopleDraft.includeGallery));
      params.set("galleryCount", String(peopleDraft.galleryCount));
      // Send tiers even when empty (empty string → all), so clearing every tier
      // overrides the saved config's non-empty list.
      params.set("tiers", peopleDraft.tiers.join(","));
      params.set("favoritesOnly", String(peopleDraft.favoritesOnly));
      params.set("limit", "60");
      return fetch(`/api/people/hero-wall?${params.toString()}`).then((r) => r.json());
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  // People entries fed to HeroMosaic as MosaicMovie (title = person name). The
  // people wall is always "both" style — layout knobs come from peopleDraft.
  const previewPeopleMovies: MosaicMovie[] = previewPeople.map((e) => ({
    ...e,
    title: e.name,
  }));
  const peopleWallConfig: HeroMosaicConfig = {
    columnCount: peopleDraft.columnCount,
    style: "both",
    angle: peopleDraft.angle,
    flow: peopleDraft.flow,
    libraryWeights: {},
    yearFrom: null,
    yearTo: null,
    minWidth: null,
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const config: HeroMosaicConfig = {
        ...draft,
        libraryWeights: effectiveWeights,
      };
      const tvConfig: HeroMosaicConfig = {
        ...tvDraft,
        libraryWeights: tvEffectiveWeights,
      };
      // Persist all three walls in a single request; the endpoint round-trips
      // each config independently.
      const res = await fetch("/api/settings/personal-metadata", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroMosaicConfig: config,
          tvHeroMosaicConfig: tvConfig,
          peopleMosaicConfig: peopleDraft,
        }),
      });
      if (res.ok) {
        showToast(t("saved"), true);
        queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
        queryClient.invalidateQueries({ queryKey: ["movies", "hero-wall"] });
        queryClient.invalidateQueries({ queryKey: ["tv-shows", "hero-wall"] });
        queryClient.invalidateQueries({ queryKey: ["people", "hero-wall"] });
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

        {/* ── Movie Wall section (cinema domain only) ── */}
        {domain !== "tv" && (
          <>
            <SectionHeader>{t("movieWallSection")}</SectionHeader>

            <WallEditor
              draft={draft}
              patch={patch}
              setLibWeight={setLibWeight}
              customWeights={customWeights}
              setCustomWeights={setCustomWeights}
              libraries={libraries}
              effectiveWeights={effectiveWeights}
              weightSum={weightSum}
              previewMovies={previewMovies}
              libraryCountLabel={(count) => t("movieCount", { count })}
            />
          </>
        )}

        {/* ── TV Wall section (tv domain only) ── */}
        {domain === "tv" && (
          <>
            <SectionHeader>{t("tvWallSection")}</SectionHeader>

            <WallEditor
              draft={tvDraft}
              patch={patchTv}
              setLibWeight={setTvLibWeight}
              customWeights={tvCustomWeights}
              setCustomWeights={setTvCustomWeights}
              libraries={tvLibraries}
              effectiveWeights={tvEffectiveWeights}
              weightSum={tvWeightSum}
              previewMovies={previewTvMovies}
              libraryCountLabel={(count) => t("showCount", { count })}
            />
          </>
        )}

        {/* ── People Wall section (cinema domain only) ── */}
        {domain !== "tv" && (
          <>
        <SectionHeader>{t("peopleWallSection")}</SectionHeader>

        {/* People live preview */}
        <div className={`${cardClass} max-w-[900px]`}>
          <h2 className="text-lg font-semibold text-foreground">{t("preview")}</h2>
          <div className="relative aspect-[21/9] overflow-hidden rounded-lg bg-[#0a0a0f]">
            {previewPeopleMovies.length >= 8 ? (
              <HeroMosaic
                movies={previewPeopleMovies}
                config={peopleWallConfig}
                featuredEnabled={false}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {t("peoplePreviewTooFew")}
              </div>
            )}
            {/* Bottom gradient mimicking the real home hero. */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-transparent" />
          </div>
        </div>

        {/* People layout: flow + columns + angle (no style — always "both") */}
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-foreground">{t("layout")}</h2>

          {/* Flow (scroll direction) — client-only re-render, so it stays OUT of
              the preview queryKey (same as columnCount/angle). */}
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("flow")}</p>
            <div className="flex flex-wrap gap-2">
              {FLOW_OPTIONS.map((f) => (
                <SegButton
                  key={f}
                  active={peopleDraft.flow === f}
                  onClick={() => patchPeople({ flow: f })}
                >
                  {t(f === "vertical" ? "flowVertical" : "flowHorizontal")}
                </SegButton>
              ))}
            </div>
          </div>

          {/* Column count */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{t("columnCount")}</p>
                <p className="text-xs text-muted-foreground">{t("columnCountDesc")}</p>
              </div>
              <span className="font-mono text-sm font-semibold text-foreground">
                {peopleDraft.columnCount}
              </span>
            </div>
            <input
              type="range"
              min={8}
              max={24}
              step={1}
              value={peopleDraft.columnCount}
              onChange={(e) => patchPeople({ columnCount: Number(e.target.value) })}
              className="w-full cursor-pointer accent-primary"
              style={{ accentColor: "var(--primary)" }}
            />
          </div>

          {/* Angle */}
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">{t("angle")}</p>
            <div className="flex flex-wrap gap-3">
              {ANGLE_OPTIONS.map((a) => {
                const active = peopleDraft.angle === a;
                return (
                  <button
                    key={a}
                    onClick={() => patchPeople({ angle: a })}
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

        {/* Image sources: fanart / gallery toggles + gallery count */}
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-foreground">{t("imageSources")}</h2>

          {/* Include fanart */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">{t("includeFanart")}</p>
              <p className="text-xs text-muted-foreground">{t("includeFanartDesc")}</p>
            </div>
            <button
              onClick={() => patchPeople({ includeFanart: !peopleDraft.includeFanart })}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-fluid cursor-pointer ${
                peopleDraft.includeFanart ? "bg-primary" : "bg-white/20"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  peopleDraft.includeFanart ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Include gallery */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">{t("includeGallery")}</p>
              <p className="text-xs text-muted-foreground">{t("includeGalleryDesc")}</p>
            </div>
            <button
              onClick={() => patchPeople({ includeGallery: !peopleDraft.includeGallery })}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-fluid cursor-pointer ${
                peopleDraft.includeGallery ? "bg-primary" : "bg-white/20"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  peopleDraft.includeGallery ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Gallery count — only meaningful when gallery images are included. */}
          {peopleDraft.includeGallery && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">{t("galleryCount")}</p>
                <span className="font-mono text-sm font-semibold text-foreground">
                  {peopleDraft.galleryCount}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={peopleDraft.galleryCount}
                onChange={(e) => patchPeople({ galleryCount: Number(e.target.value) })}
                className="w-full cursor-pointer accent-primary"
                style={{ accentColor: "var(--primary)" }}
              />
            </div>
          )}
        </div>

        {/* People filters: rating tiers + favorites */}
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-foreground">{t("filters")}</h2>

          {/* Rating tiers — multi-select; empty selection means all (no filter).
              Chips carry the tier's own color so S/A/B read at a glance. */}
          <div>
            <p className="mb-1 text-sm font-medium text-foreground">{t("ratingTiers")}</p>
            <p className="mb-2 text-xs text-muted-foreground">{t("ratingTiersDesc")}</p>
            <div className="flex flex-wrap gap-2">
              {TIER_OPTIONS.map((tier) => {
                const active = peopleDraft.tiers.includes(tier);
                const isUnrated = tier === "unrated";
                const tierColor = isUnrated ? "text-muted-foreground" : getTierColor(tier as Tier);
                const tierBorder = isUnrated ? "border-white/10" : getTierBorderColor(tier as Tier);
                return (
                  <button
                    key={tier}
                    onClick={() =>
                      patchPeople({
                        tiers: active
                          ? peopleDraft.tiers.filter((x) => x !== tier)
                          : [...peopleDraft.tiers, tier],
                      })
                    }
                    className={`min-w-[3rem] rounded-lg border px-3 py-2 text-sm font-black tracking-wider transition-fluid cursor-pointer ${
                      active
                        ? `bg-primary/20 border-primary/50 ${tierColor}`
                        : `bg-white/[0.02] ${tierBorder} ${tierColor} opacity-60 hover:opacity-100`
                    }`}
                  >
                    {isUnrated ? t("unrated") : tier}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Favorites only */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-foreground">{t("favoritesOnly")}</p>
            <button
              onClick={() => patchPeople({ favoritesOnly: !peopleDraft.favoritesOnly })}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-fluid cursor-pointer ${
                peopleDraft.favoritesOnly ? "bg-primary" : "bg-white/20"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  peopleDraft.favoritesOnly ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
          </>
        )}

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

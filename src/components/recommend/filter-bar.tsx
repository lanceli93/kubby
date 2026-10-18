"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, RotateCcw, SlidersHorizontal, Sparkles, Tag } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RECOMMEND_PRESET_ORDER } from "@/lib/recommend/presets";
import type {
  RecommendFilters,
  RecommendMix,
  RecommendPreset,
  RecommendTheme,
} from "@/lib/recommend/types";

/**
 * Glass filter bar for the recommend page. Lives OUTSIDE the scene's 3D
 * subtree (backdrop-filter dies under preserve-3d). Two rows on desktop;
 * collapses to a one-line summary + toggle on phones.
 */

const RUNTIME_OPTIONS = [0, 90, 120, 150] as const;
const MIX_OPTIONS: RecommendMix[] = ["movies", "mixed", "actors"];
const WATCHED_OPTIONS = ["unwatched", "any", "watched"] as const;
const THEMES: RecommendTheme[] = ["vortex", "tabletop"];

/** Count that eases to its new value (writes textContent — no re-renders). */
function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLElement>(null);
  const shown = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (from === null || from === value) {
      el.textContent = String(value);
      shown.current = value;
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 450);
      const v = Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3)));
      el.textContent = String(v);
      shown.current = v;
      if (t < 1) raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <b ref={ref} className="mx-0.5 text-[0.9375rem] font-bold tabular-nums text-foreground" />;
}

interface FilterBarProps {
  filters: RecommendFilters;
  onChange: (next: RecommendFilters) => void;
  onPreset: (preset: RecommendPreset) => void;
  onReset: () => void;
  genres: string[];
  tags: string[];
  movieCount: number | null;
  actorCount: number | null;
  theme: RecommendTheme;
  onTheme: (theme: RecommendTheme) => void;
}

export function FilterBar({
  filters,
  onChange,
  onPreset,
  onReset,
  genres,
  tags,
  movieCount,
  actorCount,
  theme,
  onTheme,
}: FilterBarProps) {
  const t = useTranslations("recommend");
  const [open, setOpen] = useState(false);
  const selectedGenres = new Set(filters.genres ?? []);
  const selectedTags = new Set(filters.tags ?? []);
  const mix = filters.mix ?? "mixed";
  const watched = filters.watched ?? "unwatched";
  const minRating = filters.minRating ?? 0;

  const toggleIn = (list: string[] | undefined, v: string) => {
    const s = new Set(list ?? []);
    if (s.has(v)) s.delete(v);
    else s.add(v);
    return s.size ? [...s] : undefined;
  };

  const presetChips = RECOMMEND_PRESET_ORDER.map((p) => (
    <button
      key={p}
      type="button"
      className="rc-chip-btn focus-ring"
      data-on={filters.preset === p}
      data-gold={p === "actorSpotlight"}
      aria-pressed={filters.preset === p}
      onClick={() => onPreset(p)}
    >
      {t(`presets.${p}`)}
    </button>
  ));

  const segment = <T extends string | number>(
    label: string,
    options: readonly T[],
    value: T,
    text: (v: T) => string,
    onPick: (v: T) => void,
    className = ""
  ) => (
    <div className={`rc-seg ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className="focus-ring"
          data-on={value === o}
          onClick={() => onPick(o)}
        >
          {text(o)}
        </button>
      ))}
    </div>
  );

  const mixSeg = (cls: string) =>
    segment(t("mixLabel"), MIX_OPTIONS, mix, (m) => t(`mix.${m}`), (m) => onChange({ ...filters, mix: m }), cls);
  const watchedSeg = (cls: string) =>
    segment(
      t("watchedLabel"),
      WATCHED_OPTIONS,
      watched,
      (w) => t(`watched.${w}`),
      (w) => onChange({ ...filters, watched: w }),
      cls
    );
  const themeSeg = (cls: string) =>
    segment(
      t("theme"),
      THEMES,
      theme,
      (th) => t(`themes.${th}`),
      onTheme,
      cls
    );

  const count = (
    <div className="flex-none whitespace-nowrap rounded-[0.625rem] bg-black/30 px-2.5 py-1.5 text-xs text-muted-foreground">
      {t.rich("candidates", {
        count: movieCount ?? 0,
        b: () => <AnimatedNumber value={movieCount ?? 0} />,
      })}
      {mix !== "movies" && actorCount != null && (
        <span className="text-[#d9c38d]"> · {t("actorsCount", { count: actorCount })}</span>
      )}
    </div>
  );

  return (
    <div className="rc-glass pointer-events-auto mx-auto flex w-full max-w-[84rem] flex-col gap-2 rounded-2xl px-3 py-2 md:px-4">
      {/* Row 1 — presets, mix, watched, count, theme */}
      <div className="flex items-center gap-3">
        <div className="flex flex-none items-center gap-1.5 whitespace-nowrap text-sm font-extrabold tracking-wide">
          <Sparkles className="h-4 w-4 text-[#818cf8]" />
          <span className="hidden sm:inline">{t("title")}</span>
        </div>
        <span className="hidden h-5 w-px flex-none bg-white/10 md:block" />
        <div className="rc-scroll-mask hidden min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-0.5 py-1 md:flex">
          {presetChips}
        </div>
        <div className="ml-auto flex flex-none items-center gap-2 md:ml-0">
          {mixSeg("hidden md:inline-flex")}
          {watchedSeg("hidden md:inline-flex")}
          {count}
          {themeSeg("hidden lg:inline-flex")}
          <button
            type="button"
            className="rc-chip-btn focus-ring inline-flex items-center gap-1 md:hidden"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t("filters")}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Row 2 — genres, tags, rating, runtime (collapsible on phones) */}
      <div className={`${open ? "flex" : "hidden"} flex-wrap items-center gap-x-3 gap-y-2 md:flex lg:flex-nowrap`}>
        {/* phones: row 1 only carries the summary, so the rest lives here */}
        <div className="flex w-full flex-wrap gap-1.5 md:hidden">{presetChips}</div>
        <div className="flex w-full flex-wrap gap-2 md:hidden">
          {mixSeg("")}
          {watchedSeg("")}
        </div>

        <div className="rc-scroll-mask flex w-full min-w-0 items-center gap-1.5 overflow-x-auto px-0.5 py-1 lg:w-auto lg:flex-1">
          <button
            type="button"
            className="rc-chip-btn focus-ring"
            data-on={selectedGenres.size === 0}
            onClick={() => onChange({ ...filters, genres: undefined })}
          >
            {t("allGenres")}
          </button>
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              className="rc-chip-btn focus-ring"
              data-on={selectedGenres.has(g)}
              aria-pressed={selectedGenres.has(g)}
              onClick={() => onChange({ ...filters, genres: toggleIn(filters.genres, g) })}
            >
              {g}
            </button>
          ))}
        </div>

        {tags.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="rc-chip-btn focus-ring inline-flex items-center gap-1 outline-none"
              data-on={selectedTags.size > 0}
            >
              <Tag className="h-3.5 w-3.5" />
              {selectedTags.size ? t("tagsCount", { count: selectedTags.size }) : t("tags")}
              <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-[min(24rem,60vh)] w-56 overflow-y-auto border-white/10 bg-black/80 backdrop-blur-xl"
            >
              {tags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag}
                  checked={selectedTags.has(tag)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => onChange({ ...filters, tags: toggleIn(filters.tags, tag) })}
                >
                  {tag}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <span className="hidden h-5 w-px flex-none bg-white/10 lg:block" />

        <label className="flex flex-none items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
          {t("minRating")}
          <b className="inline-block min-w-[1.75rem] font-semibold tabular-nums text-[#facc15]">
            {minRating > 0 ? minRating.toFixed(1) : t("any")}
          </b>
          <input
            type="range"
            className="rc-range"
            min={0}
            max={9}
            step={0.5}
            value={minRating}
            aria-label={t("minRating")}
            style={{ "--p": `${(minRating / 9) * 100}%` } as React.CSSProperties}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange({ ...filters, minRating: v > 0 ? v : undefined });
            }}
          />
        </label>

        <div className="flex flex-none items-center gap-1.5 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">{t("runtime")}</span>
          {segment<number>(
            t("runtime"),
            RUNTIME_OPTIONS,
            filters.maxRuntime ?? 0,
            (m) => (m ? t("runtimeMax", { min: m }) : t("any")),
            (m) => onChange({ ...filters, maxRuntime: m || undefined })
          )}
        </div>

        <button
          type="button"
          className="glass-btn focus-ring flex-none rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
          title={t("reset")}
          aria-label={t("reset")}
          onClick={onReset}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        {themeSeg("lg:hidden")}
      </div>
    </div>
  );
}

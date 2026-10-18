"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import {
  Check,
  ChevronDown,
  Clapperboard,
  Library,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { RECOMMEND_PRESET_ORDER } from "@/lib/recommend/presets";
import type {
  RecommendFilters,
  RecommendMix,
  RecommendPreset,
  RecommendTheme,
} from "@/lib/recommend/types";
import { FacetPicker, type FacetOption } from "./facet-picker";

/**
 * Glass filter bar for the recommend page. Lives OUTSIDE the scene's 3D
 * subtree (backdrop-filter dies under preserve-3d). Two rows on desktop —
 * row 1 "what to draw" (presets, deck mix, count, theme), row 2 "filters"
 * (library, genre/tag pickers + the active selection as removable chips, watched,
 * rating, runtime); collapses to a one-line summary + toggle on phones.
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

interface LibraryOption {
  id: string;
  name: string;
}

/** Single-select movie-library picker ("All libraries" + each library). */
function LibraryPicker({
  libraries,
  value,
  onPick,
}: {
  libraries: LibraryOption[];
  value: string | undefined;
  onPick: (id: string | undefined) => void;
}) {
  const t = useTranslations("recommend");
  const [open, setOpen] = useState(false);
  const current = libraries.find((l) => l.id === value);
  const options: { id: string | undefined; name: string }[] = [
    { id: undefined, name: t("allLibraries") },
    ...libraries,
  ];
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="rc-chip-btn focus-ring inline-flex max-w-[12rem] items-center gap-1 outline-none"
        data-on={!!current}
        aria-label={`${t("library")}: ${current?.name ?? t("allLibraries")}`}
      >
        <Library className="h-3.5 w-3.5 flex-none" />
        <span className="min-w-0 truncate">{current?.name ?? t("allLibraries")}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-none transition-transform ${open ? "rotate-180" : ""}`} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-label={t("library")}
          className="z-50 max-h-[min(20rem,60vh,var(--radix-popover-content-available-height))] w-56 origin-(--radix-popover-content-transform-origin) overflow-y-auto rounded-xl border border-white/10 bg-black/80 p-1.5 text-foreground shadow-2xl backdrop-blur-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div role="radiogroup" aria-label={t("library")} className="flex flex-col">
            {options.map((o) => {
              const on = o.id === current?.id;
              return (
                <button
                  key={o.id ?? ""}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`focus-ring flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-white/10 ${on ? "text-foreground" : "text-[#c4c4d6]"}`}
                  onClick={() => {
                    onPick(o.id);
                    setOpen(false);
                  }}
                >
                  <Check className={`h-3.5 w-3.5 flex-none text-[#818cf8] ${on ? "" : "invisible"}`} />
                  <span className="min-w-0 truncate">{o.name}</span>
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface FilterBarProps {
  filters: RecommendFilters;
  onChange: (next: RecommendFilters) => void;
  onPreset: (preset: RecommendPreset) => void;
  onReset: () => void;
  /** movie libraries only; the picker shows when there are 2+ */
  libraries: LibraryOption[];
  genres: FacetOption[];
  tags: FacetOption[];
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
  libraries,
  genres,
  tags,
  movieCount,
  actorCount,
  theme,
  onTheme,
}: FilterBarProps) {
  const t = useTranslations("recommend");
  const [open, setOpen] = useState(false);
  const selectedGenres = filters.genres ?? [];
  const selectedTags = filters.tags ?? [];
  const mix = filters.mix ?? "mixed";
  const watched = filters.watched ?? "unwatched";
  const minRating = filters.minRating ?? 0;

  const without = (list: string[], v: string) => {
    const next = list.filter((x) => x !== v);
    return next.length ? next : undefined;
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

  const activeChip = (key: string, label: string, onRemove: () => void) => (
    <button
      key={key}
      type="button"
      className="rc-chip-btn focus-ring inline-flex items-center gap-1"
      data-on
      aria-label={t("removeFilter", { name: label })}
      onClick={onRemove}
    >
      {label}
      <X className="h-3 w-3 opacity-70" />
    </button>
  );

  return (
    <div className="rc-glass pointer-events-auto mx-auto flex w-full max-w-[84rem] flex-col gap-2 rounded-2xl px-3 py-2 md:px-4">
      {/* Row 1 — what to draw: presets, mix, count, theme */}
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

      {/* Row 2 — filters: pickers + active chips, watched, rating, runtime (collapsible on phones) */}
      <div className={`${open ? "flex" : "hidden"} flex-wrap items-center gap-x-3 gap-y-2 md:flex lg:flex-nowrap`}>
        {/* phones: row 1 only carries the summary, so presets + mix live here */}
        <div className="flex w-full flex-wrap gap-1.5 md:hidden">{presetChips}</div>
        {mixSeg("md:hidden")}

        <div className="flex w-full min-w-0 items-center gap-1.5 max-md:flex-wrap lg:w-auto lg:flex-1">
          {libraries.length > 1 && (
            <LibraryPicker
              libraries={libraries}
              value={filters.libraryId}
              onPick={(id) => onChange({ ...filters, libraryId: id })}
            />
          )}
          <FacetPicker
            icon={<Clapperboard className="h-3.5 w-3.5" />}
            label={t("genres")}
            searchPlaceholder={t("searchGenres")}
            options={genres}
            selected={filters.genres}
            onChange={(next) => onChange({ ...filters, genres: next })}
          />
          {(tags.length > 0 || selectedTags.length > 0) && (
            <FacetPicker
              icon={<Tag className="h-3.5 w-3.5" />}
              label={t("tags")}
              searchPlaceholder={t("searchTags")}
              options={tags}
              selected={filters.tags}
              onChange={(next) => onChange({ ...filters, tags: next })}
              prefix="#"
            />
          )}
          {/* -my-1 keeps the row height stable once chips (and their glow padding) appear */}
          <div className="rc-scroll-mask -my-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-0.5 py-1">
            {selectedGenres.length + selectedTags.length === 0 ? (
              <span className="whitespace-nowrap px-1 text-xs text-muted-foreground/50">{t("noFilters")}</span>
            ) : (
              <>
                {selectedGenres.map((g) =>
                  activeChip(`g:${g}`, g, () => onChange({ ...filters, genres: without(selectedGenres, g) }))
                )}
                {selectedTags.map((tag) =>
                  activeChip(`t:${tag}`, `#${tag}`, () => onChange({ ...filters, tags: without(selectedTags, tag) }))
                )}
              </>
            )}
          </div>
        </div>

        <span className="hidden h-5 w-px flex-none bg-white/10 lg:block" />

        {watchedSeg("")}

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
          {/* label dropped on narrow desktops so the chip strip keeps some room */}
          <span className="whitespace-nowrap lg:hidden xl:inline">{t("runtime")}</span>
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

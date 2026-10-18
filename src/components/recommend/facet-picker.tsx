"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Popover } from "radix-ui";
import { ChevronDown, Search, X } from "lucide-react";

/**
 * Searchable multi-select popover for the recommend filter bar (genres and
 * tags). Built for real libraries: dozens of genres, hundreds of TMDB
 * keywords — options are sorted by movie count, filtered by substring and
 * capped at RENDER_CAP chips so a big tag list stays cheap to render.
 */

export interface FacetOption {
  name: string;
  count: number;
}

const RENDER_CAP = 150;

interface FacetPickerProps {
  icon: ReactNode;
  label: string;
  searchPlaceholder: string;
  options: FacetOption[];
  selected: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  /** shown before each option name (e.g. "#" for tags) */
  prefix?: string;
}

export function FacetPicker({
  icon,
  label,
  searchPlaceholder,
  options,
  selected,
  onChange,
  prefix = "",
}: FacetPickerProps) {
  const t = useTranslations("recommend");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const picked = useMemo(() => selected ?? [], [selected]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  // most-used first, then by name; lowercased once for the search
  const sorted = useMemo(
    () =>
      [...options]
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .map((o) => ({ ...o, key: o.name.toLowerCase() })),
    [options]
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((o) => o.key.includes(q)) : sorted;
  }, [sorted, query]);
  const shown = matches.length > RENDER_CAP ? matches.slice(0, RENDER_CAP) : matches;

  const toggle = (name: string) => {
    const next = pickedSet.has(name) ? picked.filter((v) => v !== name) : [...picked, name];
    onChange(next.length ? next : undefined);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <Popover.Trigger
        className="rc-chip-btn focus-ring inline-flex items-center gap-1 outline-none"
        data-on={picked.length > 0}
      >
        {icon}
        {label}
        {picked.length > 0 && (
          <span className="ml-0.5 min-w-[1.125rem] rounded-full bg-white/15 px-1 text-center text-[0.625rem] font-bold leading-4 tabular-nums">
            {picked.length}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-label={label}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="z-50 flex max-h-[min(26rem,60vh,var(--radix-popover-content-available-height))] w-[min(23rem,calc(100vw-1.5rem))] origin-(--radix-popover-content-transform-origin) flex-col rounded-xl border border-white/10 bg-black/80 p-2.5 text-foreground shadow-2xl backdrop-blur-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <label className="flex flex-none items-center gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5 ring-1 ring-white/10 focus-within:ring-[#818cf8]/60">
            <Search className="h-3.5 w-3.5 flex-none text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !matches.length) return;
                e.preventDefault();
                toggle(matches[0].name);
                setQuery("");
              }}
            />
          </label>

          {picked.length > 0 && (
            <div className="mt-2 flex flex-none items-start gap-2 border-b border-white/10 pb-2">
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {picked.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="rc-chip-btn focus-ring inline-flex max-w-full items-center gap-1"
                    data-on
                    aria-label={t("removeFilter", { name: prefix + name })}
                    onClick={() => toggle(name)}
                  >
                    <span className="min-w-0 truncate">
                      {prefix}
                      {name}
                    </span>
                    <X className="h-3 w-3 flex-none opacity-70" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="focus-ring flex-none rounded px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onChange(undefined)}
              >
                {t("clear")}
              </button>
            </div>
          )}

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
            {shown.length ? (
              <div className="flex flex-wrap gap-1.5">
                {shown.map((o) => {
                  const on = pickedSet.has(o.name);
                  return (
                    <button
                      key={o.name}
                      type="button"
                      className="rc-chip-btn focus-ring inline-flex max-w-full items-baseline gap-1.5"
                      data-on={on}
                      aria-pressed={on}
                      onClick={() => toggle(o.name)}
                    >
                      <span className="min-w-0 truncate">
                        {prefix}
                        {o.name}
                      </span>
                      <span className="text-[0.625rem] tabular-nums opacity-55">{o.count}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">{t("noMatches")}</p>
            )}
            {matches.length > shown.length && (
              <p className="pt-2.5 text-center text-[0.6875rem] text-muted-foreground/70">
                {t("moreMatches", { count: matches.length - shown.length })}
              </p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

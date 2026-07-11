"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations, useLocale } from "next-intl";
import { Play, ImageOff, Check } from "lucide-react";
import { computeJustifiedLayout } from "@/lib/photos/justified-layout";

// Reusable month-grouped justified photo grid with row-level virtual scrolling
// (Google Photos style). Shared by the main timeline and album detail — the
// only difference is the query scope (libraryId / albumId) and, in album
// detail, that selection removes rather than adds. Selection state is owned by
// the parent so it can render the contextual action bar.

export interface PhotoItem {
  id: string;
  isVideo: boolean;
  takenAt: number; // epoch ms, never null
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fileName: string;
}

interface PhotosPage {
  items: PhotoItem[];
  nextCursor: string | null;
}

const PAGE_SIZE = 200;
const TILE_GAP = 4;
const MONTH_HEADER_HEIGHT = 64;
const H_PADDING = 16; // px each side, matches px-4

type VirtualRow =
  | { kind: "header"; key: string; label: string }
  | {
      kind: "grid";
      key: string;
      height: number;
      tiles: { item: PhotoItem; width: number; height: number }[];
    };

function aspectOf(item: PhotoItem): number {
  if (item.width && item.height && item.width > 0 && item.height > 0) {
    return item.width / item.height;
  }
  return 1;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function groupByMonth(items: PhotoItem[]): { monthKey: string; items: PhotoItem[] }[] {
  const groups: { monthKey: string; items: PhotoItem[] }[] = [];
  let current: { monthKey: string; items: PhotoItem[] } | null = null;
  for (const item of items) {
    const d = new Date(item.takenAt);
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    if (!current || current.monthKey !== monthKey) {
      current = { monthKey, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}

// Short "day + time" label revealed on hover — the month is already the section
// header, so the tile only adds the finer-grained capture moment.
function tileDateLabel(millis: number, locale: string): string {
  const intlLocale = locale === "zh" ? "zh-CN" : locale;
  return new Intl.DateTimeFormat(intlLocale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(millis));
}

export interface PhotoGridHandle {
  /** Flat list of currently-loaded items (for select-all in the parent). */
  items: PhotoItem[];
}

export function PhotoGrid({
  libraryId,
  albumId,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
  onOpen,
  onItemsChange,
  emptyText,
}: {
  libraryId?: string | null;
  albumId?: string | null;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onOpen: (id: string) => void;
  /** Reports the loaded item list up to the parent (e.g. for select-all). */
  onItemsChange?: (items: PhotoItem[]) => void;
  emptyText?: string;
}) {
  const t = useTranslations("photos");
  const locale = useLocale();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery<PhotosPage>({
      queryKey: ["photos", { libraryId: libraryId ?? null, albumId: albumId ?? null }],
      queryFn: ({ pageParam }) => {
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        if (pageParam) params.set("cursor", String(pageParam));
        if (libraryId) params.set("libraryId", libraryId);
        if (albumId) params.set("albumId", albumId);
        return fetch(`/api/photos?${params}`).then((r) => r.json());
      },
      initialPageParam: "",
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  useEffect(() => {
    onItemsChange?.(items);
  }, [items, onItemsChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      setContainerWidth(el.clientWidth - H_PADDING * 2);
      setIsMobile(window.innerWidth < 640);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const monthLabel = useCallback(
    (millis: number) => {
      const intlLocale = locale === "zh" ? "zh-CN" : locale;
      return new Intl.DateTimeFormat(intlLocale, {
        year: "numeric",
        month: "long",
      }).format(new Date(millis));
    },
    [locale],
  );

  const rows = useMemo<VirtualRow[]>(() => {
    if (containerWidth <= 0 || items.length === 0) return [];
    const targetHeight = isMobile ? 120 : 180;
    const out: VirtualRow[] = [];
    for (const group of groupByMonth(items)) {
      out.push({
        kind: "header",
        key: `h-${group.monthKey}`,
        label: monthLabel(group.items[0].takenAt),
      });
      const layoutRows = computeJustifiedLayout(
        group.items.map((it) => ({ aspect: aspectOf(it) })),
        { containerWidth, targetHeight, gap: TILE_GAP },
      );
      for (let r = 0; r < layoutRows.length; r++) {
        const lr = layoutRows[r];
        out.push({
          kind: "grid",
          key: `g-${group.monthKey}-${r}`,
          height: lr.height,
          tiles: lr.tiles.map((tile) => ({
            item: group.items[tile.index],
            width: tile.width,
            height: tile.height,
          })),
        });
      }
    }
    return out;
  }, [items, containerWidth, isMobile, monthLabel]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return MONTH_HEADER_HEIGHT;
      return row.kind === "header" ? MONTH_HEADER_HEIGHT : row.height + TILE_GAP;
    },
    overscan: 4,
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  const virtualRows = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1];
    if (!last) return;
    if (last.index >= rows.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualRows, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const showEmpty = !isLoading && items.length === 0;

  return (
    <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-4 md:px-6">
      {isLoading && <TimelineSkeleton />}

      {showEmpty && (
        <div className="flex h-full items-center justify-center text-center text-muted-foreground">
          {emptyText ?? t("empty")}
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualRows.map((vRow) => {
            const row = rows[vRow.index];
            if (!row) return null;
            return (
              <div
                key={vRow.key}
                data-index={vRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vRow.start}px)`,
                }}
              >
                {row.kind === "header" ? (
                  <div className="flex items-end pb-2 pt-6 text-sm font-medium text-muted-foreground">
                    {row.label}
                  </div>
                ) : (
                  <div className="flex" style={{ gap: TILE_GAP, height: row.height }}>
                    {row.tiles.map(({ item, width, height }) => (
                      <PhotoTile
                        key={item.id}
                        item={item}
                        width={width}
                        height={height}
                        locale={locale}
                        selectionMode={selectionMode}
                        selected={selectedIds?.has(item.id) ?? false}
                        onOpen={onOpen}
                        onToggleSelect={onToggleSelect}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isFetchingNextPage && (
        <div className="flex justify-center py-6 text-sm text-muted-foreground">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/60" />
        </div>
      )}
    </div>
  );
}

function PhotoTile({
  item,
  width,
  height,
  locale,
  selectionMode,
  selected,
  onOpen,
  onToggleSelect,
}: {
  item: PhotoItem;
  width: number;
  height: number;
  locale: string;
  selectionMode: boolean;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleSelect?: (id: string) => void;
}) {
  const t = useTranslations("photos");
  const [errored, setErrored] = useState(false);

  // The tile itself never grows (that would tear the justified row and force a
  // horizontal scrollbar inside the virtualizer). Hover feedback stays fully
  // contained: the image zooms inside the clip, an inset ring appears, and a
  // bottom gradient scrim reveals the capture date. In selection mode the tile
  // toggles selection instead of opening.
  const handleClick = () => {
    if (selectionMode) onToggleSelect?.(item.id);
    else onOpen(item.id);
  };

  // In selection mode the tile acts as a checkbox (screen readers announce
  // selected state); otherwise it's a plain button that opens the lightbox.
  const label = item.fileName || tileDateLabel(item.takenAt, locale);

  return (
    <button
      type="button"
      onClick={handleClick}
      role={selectionMode ? "checkbox" : undefined}
      aria-checked={selectionMode ? selected : undefined}
      aria-label={selectionMode ? label : t("openItem", { name: label })}
      style={{ width, height }}
      className={`focus-ring group relative shrink-0 cursor-pointer overflow-hidden rounded-[4px] bg-white/[0.06] ring-1 ring-inset transition-[box-shadow] duration-200 ${
        selected ? "ring-2 ring-primary" : "ring-transparent hover:ring-white/25"
      }`}
    >
      {errored ? (
        <div className="flex h-full w-full items-center justify-center bg-white/[0.06] text-muted-foreground">
          <ImageOff className="h-6 w-6" />
        </div>
      ) : (
        <img
          src={`/api/photos/${item.id}/thumb`}
          alt={item.fileName}
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          className={`h-full w-full object-cover transition-transform duration-300 ease-out ${
            selected ? "scale-95" : "scale-100 group-hover:scale-[1.06]"
          }`}
        />
      )}

      {/* Selection affordance — a check circle, always visible in selection
          mode (filled when selected), and on hover otherwise as a hint. */}
      {(selectionMode || onToggleSelect) && (
        <span
          className={`pointer-events-none absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border transition-opacity duration-150 ${
            selected
              ? "border-primary bg-primary text-primary-foreground opacity-100"
              : selectionMode
                ? "border-white/70 bg-black/30 opacity-100"
                : "border-white/70 bg-black/30 opacity-0 group-hover:opacity-100"
          }`}
        >
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      )}

      {/* Bottom scrim + capture date on hover (photos only). */}
      {!errored && !item.isVideo && !selectionMode && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end bg-gradient-to-t from-black/70 via-black/25 to-transparent px-2 pb-1.5 pt-6 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="truncate text-[11px] font-medium leading-none text-white/90 drop-shadow">
            {tileDateLabel(item.takenAt, locale)}
          </span>
        </div>
      )}

      {item.isVideo && (
        <>
          <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/15" />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Play className="h-8 w-8 fill-white/85 text-white/85 drop-shadow transition-transform duration-200 group-hover:scale-110" />
          </span>
          {item.durationSeconds != null && (
            <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[11px] font-medium leading-none text-white">
              {formatDuration(item.durationSeconds)}
            </span>
          )}
        </>
      )}
    </button>
  );
}

function TimelineSkeleton() {
  return (
    <div className="animate-pulse space-y-6 py-6">
      {[0, 1, 2].map((r) => (
        <div key={r} className="space-y-2">
          <div className="h-4 w-32 rounded bg-white/[0.08]" />
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5].map((c) => (
              <div key={c} className="h-40 flex-1 rounded-[4px] bg-white/[0.06]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

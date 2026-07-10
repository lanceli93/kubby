"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations, useLocale } from "next-intl";
import { Play, ImageOff } from "lucide-react";
import { computeJustifiedLayout } from "@/lib/photos/justified-layout";

// The photos domain shares the cinema domain's dark theme (user decision —
// one consistent Kubby look across domains). The timeline is a month-grouped
// justified grid (Google Photos style) with row-level virtual scrolling —
// tens of thousands of items is the expected scale.

interface PhotoItem {
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
// Row-level layout tuning. Target row height shrinks on narrow viewports.
const TILE_GAP = 4;
const MONTH_HEADER_HEIGHT = 64;
const H_PADDING = 16; // px each side, matches px-4

// A flat, virtualizable list of rows: month headers and grid rows interleaved.
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

// Group items into contiguous month buckets (local time). Items arrive already
// sorted newest → oldest, so a single linear pass preserves order and merges
// months that straddle page boundaries.
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

export default function PhotosPage() {
  const t = useTranslations("photos");
  const locale = useLocale();
  const router = useRouter();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PhotosPage>({
    queryKey: ["photos"],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      if (pageParam) params.set("cursor", String(pageParam));
      return fetch(`/api/photos?${params}`).then((r) => r.json());
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  // Track the scroll container's inner width for (re)layout on resize.
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

  // Month label formatter, e.g. "2026年1月" / "January 2026".
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

  // Build the interleaved virtual-row list. Each month contributes one header
  // row plus however many justified grid rows its items pack into.
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
      return row.kind === "header"
        ? MONTH_HEADER_HEIGHT
        : row.height + TILE_GAP;
    },
    overscan: 4,
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  // Auto-fetch the next page when the tail of the virtual list scrolls into view.
  const virtualRows = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1];
    if (!last) return;
    if (last.index >= rows.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualRows, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const openPhoto = useCallback(
    (id: string) => router.push(`/photos/view/${id}`),
    [router],
  );

  const showEmpty = !isLoading && items.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Title bar */}
      <div className="flex items-baseline gap-3 border-b border-white/[0.06] bg-[var(--header)] px-4 py-4 md:px-6">
        <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
        {items.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {t("photoCount", { count: items.length })}
          </span>
        )}
      </div>

      {/* Scroll / virtual container */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-4 md:px-6">
        {isLoading && <TimelineSkeleton />}

        {showEmpty && (
          <div className="flex h-full items-center justify-center text-center text-muted-foreground">
            {t("empty")}
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
                          onOpen={openPhoto}
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
    </div>
  );
}

function PhotoTile({
  item,
  width,
  height,
  onOpen,
}: {
  item: PhotoItem;
  width: number;
  height: number;
  onOpen: (id: string) => void;
}) {
  const [errored, setErrored] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      style={{ width, height }}
      className="group relative shrink-0 overflow-hidden rounded-[4px] bg-white/[0.06]"
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
          className="h-full w-full object-cover transition-[filter] duration-150 group-hover:brightness-110"
        />
      )}

      {item.isVideo && (
        <>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Play className="h-8 w-8 fill-white/80 text-white/80 drop-shadow" />
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

// Lightweight loading placeholder — a few rows of dim blocks on the dark theme.
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

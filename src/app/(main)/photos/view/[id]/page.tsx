"use client";

import {
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { LightboxVideo } from "@/components/photos/lightbox-video";
import { LightboxInfoPanel } from "@/components/photos/lightbox-info-panel";

// Full-screen lightbox for a single photo/video (docs/photos-library-design.md
// §7). The container is `fixed inset-0 z-50 bg-black` so it fully covers the
// normal-flow global header. Navigation context (prev/next neighbours) reuses
// the exact same useInfiniteQuery as the timeline (queryKey ["photos"], same
// limit) — a cache hit means the already-loaded pages are shared for free;
// a deep link fetches page one on its own.

interface PhotoItem {
  id: string;
  isVideo: boolean;
  takenAt: number;
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
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;
const SWIPE_THRESHOLD = 50;

export default function PhotoViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [showInfo, setShowInfo] = useState(false);

  // Same infinite query as the timeline. React Query dedupes by queryKey, so
  // opening the lightbox from the timeline reuses the loaded pages instantly;
  // a deep link (fresh cache) fetches the first page here.
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<PhotosPage>({
      queryKey: ["photos"],
      queryFn: ({ pageParam }) => {
        const p = new URLSearchParams();
        p.set("limit", String(PAGE_SIZE));
        if (pageParam) p.set("cursor", String(pageParam));
        return fetch(`/api/photos?${p}`).then((r) => r.json());
      },
      initialPageParam: "",
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  const index = useMemo(
    () => items.findIndex((it) => it.id === id),
    [items, id],
  );
  const current = index >= 0 ? items[index] : null;
  const prev = index > 0 ? items[index - 1] : null;
  const next =
    index >= 0 && index < items.length - 1 ? items[index + 1] : null;

  // Near the tail of the loaded list, pull the next page so forward navigation
  // can keep going.
  useEffect(() => {
    if (
      index >= 0 &&
      index >= items.length - 5 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [index, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const goTo = useCallback(
    (target: PhotoItem | null) => {
      if (target) router.replace(`/photos/view/${target.id}`);
    },
    [router],
  );
  const close = useCallback(() => router.push("/photos"), [router]);

  // Keyboard: ←/→ navigate, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(prev);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(next);
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, goTo, close]);

  // Preload the immediate neighbours (images only — video isn't preloaded).
  useEffect(() => {
    for (const neighbour of [prev, next]) {
      if (neighbour && !neighbour.isVideo) {
        const img = new Image();
        img.src = `/api/photos/${neighbour.id}/file`;
      }
    }
  }, [prev, next]);

  // Touch swipe (mobile): horizontal delta > threshold navigates.
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (dx > SWIPE_THRESHOLD) goTo(prev);
    else if (dx < -SWIPE_THRESHOLD) goTo(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Media stage. Keyed by id so zoom/pan reset and the video remounts
          (triggering its cleanup) whenever the item changes. */}
      {current?.isVideo ? (
        <LightboxVideo key={id} id={id} />
      ) : (
        <ZoomableImage key={id} id={id} />
      )}

      {/* Top bar: close, file name, info toggle. Always visible (v1). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent px-4 py-3">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full text-white/80 drop-shadow transition-colors hover:bg-white/15 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="flex-1 truncate text-sm font-medium text-white/80 drop-shadow">
          {current?.fileName ?? ""}
        </span>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          aria-label="Info"
          className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full drop-shadow transition-colors hover:bg-white/15 hover:text-white ${
            showInfo ? "bg-white/15 text-white" : "text-white/80"
          }`}
        >
          <Info className="h-5 w-5" />
        </button>
      </div>

      {/* Prev / next arrows (hidden when there's no neighbour). */}
      {prev && (
        <button
          type="button"
          onClick={() => goTo(prev)}
          aria-label="Previous"
          className="absolute left-2 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white/70 drop-shadow transition-colors hover:bg-white/15 hover:text-white sm:left-4"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}
      {next && (
        <button
          type="button"
          onClick={() => goTo(next)}
          aria-label="Next"
          className="absolute right-2 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white/70 drop-shadow transition-colors hover:bg-white/15 hover:text-white sm:right-4"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}

      {showInfo && (
        <LightboxInfoPanel id={id} onClose={() => setShowInfo(false)} />
      )}
    </div>
  );
}

// Center-anchored image with a thumbnail placeholder that fades out once the
// full image loads (no white flash). Wheel zoom (0.5×–5×, center anchored),
// double-click toggles 1×/2×, drag-pan when zoomed. State resets whenever the
// component remounts (parent keys it by id).
function ZoomableImage({ id }: { id: string }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(
    null,
  );

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => {
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, z - e.deltaY * 0.002),
      );
      if (nextZoom <= 1) setOffset({ x: 0, y: 0 });
      return nextZoom;
    });
  };

  const onDoubleClick = () => {
    setZoom((z) => {
      if (z > 1) {
        setOffset({ x: 0, y: 0 });
        return 1;
      }
      return 2;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw if the pointer is already released
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset({
      x: d.ox + (e.clientX - d.startX),
      y: d.oy + (e.clientY - d.startY),
    });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ cursor: zoom > 1 ? "grab" : "default" }}
    >
      <div
        className="relative flex h-full w-full items-center justify-center"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transition: dragRef.current ? "none" : "transform 0.15s ease-out",
        }}
      >
        {/* Blurred thumb placeholder underneath, revealed until the full image
            loads. */}
        {!loaded && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/photos/${id}/thumb`}
            alt=""
            aria-hidden
            className="absolute max-h-full max-w-full scale-105 object-contain blur-lg"
            draggable={false}
          />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          // Preloading (or a warm cache) can fire `load` before React attaches
          // onLoad, leaving the fade stuck at opacity 0 — so also check
          // `complete` synchronously via the ref callback.
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0) setLoaded(true);
          }}
          src={`/api/photos/${id}/file`}
          alt=""
          onLoad={() => setLoaded(true)}
          draggable={false}
          className={`max-h-full max-w-full object-contain transition-opacity duration-200 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>
    </div>
  );
}

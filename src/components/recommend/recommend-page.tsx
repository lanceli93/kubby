"use client";

import "./recommend.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Dices } from "lucide-react";
import { GlassToast } from "@/components/ui/glass-toast";
import { useNavDrawer } from "@/components/layout/nav-drawer";
import { resolveImageSrc } from "@/lib/image-utils";
import { startPosterViewTransition } from "@/lib/view-transition";
import {
  DEFAULT_FILTERS,
  HAND_SIZE,
  RECOMMEND_PRESETS,
  handComposition,
} from "@/lib/recommend/presets";
import type {
  ActorCardData,
  MovieCardData,
  RecommendCard,
  RecommendFilters,
  RecommendItemRef,
  RecommendPreset,
  RecommendTheme,
} from "@/lib/recommend/types";
import { AmbientBackdrop, type AmbientBackdropHandle } from "./ambient-backdrop";
import { FilterBar } from "./filter-bar";
import { fetchPool, poolQueryString, postDraw, postHistory } from "./recommend-api";
import { cardKey, type DrawPhase, type HandSlot, type RecommendSceneDef } from "./scene-types";
import { VORTEX_SCENE } from "./vortex-scene";

/**
 * 今晚看什么 page shell. Owns filters, the candidate pool, the hand (locks,
 * dismiss, draw protocol — see scene-types.ts), navigation, toasts and the
 * ambient fanart backdrop; the active scene only animates. Rendered client-only
 * (the route loads it with ssr:false) so the hand can be restored from
 * sessionStorage on first render — coming back from a movie's detail page
 * finds the same hand on the table.
 */

const SCENES: Partial<Record<RecommendTheme, RecommendSceneDef>> = {
  vortex: VORTEX_SCENE,
};
const AVAILABLE_THEMES = Object.keys(SCENES) as RecommendTheme[];

const STORAGE_KEY = "kubby-recommend";
const POOL_DEBOUNCE_MS = 300;
const IDLE_AMBIENT_MS = 9000;
const REFILL_MIN_MS = 480;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const emptyHand = (): HandSlot[] => Array.from({ length: HAND_SIZE }, () => null);
const toRef = (c: RecommendCard): RecommendItemRef => ({ type: c.type, id: c.id });

interface Saved {
  filters: RecommendFilters;
  hand: HandSlot[];
  locked: string[];
}

function loadSaved(): Saved | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (!s || typeof s !== "object" || !Array.isArray(s.hand) || s.hand.length !== HAND_SIZE) return null;
    return { filters: s.filters ?? DEFAULT_FILTERS, hand: s.hand, locked: Array.isArray(s.locked) ? s.locked : [] };
  } catch {
    return null;
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Client-side mirror of the hard filters, to flag hand cards that no longer
 *  match after the user changes filters (tags aren't on the card — ignored). */
function movieMatches(c: MovieCardData, f: RecommendFilters): boolean {
  if (f.genres?.length && !c.genres.some((g) => f.genres!.includes(g))) return false;
  if (f.minRating && (c.rating ?? 0) < f.minRating) return false;
  if (f.maxRuntime && c.runtimeMinutes != null && c.runtimeMinutes > f.maxRuntime) return false;
  if (f.yearFrom != null && c.year != null && c.year < f.yearFrom) return false;
  if (f.yearTo != null && c.year != null && c.year > f.yearTo) return false;
  const w = f.watched ?? "unwatched";
  if (w === "unwatched" && c.isPlayed) return false;
  if (w === "watched" && !c.isPlayed) return false;
  return true;
}

/** How many movie / actor cards to ask for given the locked cards kept. */
function computeNeed(kept: HandSlot[], mix: RecommendFilters["mix"], free: number) {
  const comp = handComposition(mix);
  const lockedMovies = kept.filter((c) => c?.type === "movie").length;
  const lockedActors = kept.filter((c) => c?.type === "person").length;
  let actors = Math.min(free, Math.max(0, comp.actors - lockedActors));
  let movies = Math.min(free - actors, Math.max(0, comp.movies - lockedMovies));
  const rest = free - actors - movies;
  if (rest > 0) {
    if (mix === "actors") actors += rest;
    else movies += rest;
  }
  return { movies, actors };
}

/** Put new cards into the free slots: actors anywhere, movies left → right. */
function placeCards(kept: HandSlot[], cards: RecommendCard[]): HandSlot[] {
  const next = [...kept];
  const free = next.flatMap((c, i) => (c ? [] : [i]));
  for (const a of cards.filter((c) => c.type === "person")) {
    if (!free.length) break;
    const i = (Math.random() * free.length) | 0;
    next[free[i]] = a;
    free.splice(i, 1);
  }
  for (const m of cards.filter((c) => c.type === "movie")) {
    if (!free.length) break;
    next[free.shift()!] = m;
  }
  return next;
}

function fanartOf(c: RecommendCard): string | null {
  return c.type === "movie" ? c.fanartPath ?? c.posterPath : c.fanartPath ?? c.photoPath;
}

interface LibraryLite {
  id: string;
  type: string;
}

export function RecommendPage() {
  const t = useTranslations("recommend");
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { open: drawerOpen } = useNavDrawer();

  const [saved] = useState(loadSaved);
  const [filters, setFilters] = useState<RecommendFilters>(saved?.filters ?? DEFAULT_FILTERS);
  const debouncedFilters = useDebounced(filters, POOL_DEBOUNCE_MS);
  const [theme, setTheme] = useState<RecommendTheme>("vortex");
  const scene = SCENES[theme] ?? VORTEX_SCENE;
  const [hand, setHand] = useState<HandSlot[]>(saved?.hand ?? emptyHand);
  const [lockedKeys, setLockedKeys] = useState<ReadonlySet<string>>(() => new Set(saved?.locked ?? []));
  const [phase, setPhase] = useState<DrawPhase>(saved?.hand.some(Boolean) ? "dealt" : "idle");
  const [drawToken, setDrawToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });

  const busyRef = useRef(false);
  const genRef = useRef(0); // bumps per full draw; stale refills are dropped
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ambientRef = useRef<AmbientBackdropHandle>(null);
  const lastHoverAt = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const drawWrapRef = useRef<HTMLDivElement>(null);
  const drawBtnRef = useRef<HTMLButtonElement>(null);

  // ── data ──
  const { data: libraries } = useQuery<LibraryLite[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
  });
  // Cinema-only feature: allowlist movie libraries (cross-domain rule).
  const hasLibrary = libraries ? libraries.some((l) => l.type === "movie") : undefined;

  const { data: filterOptions } = useQuery<{ genres: string[]; tags: string[] }>({
    queryKey: ["filters", null],
    queryFn: () => fetch("/api/filters").then((r) => r.json()),
    enabled: hasLibrary === true,
  });

  const qs = poolQueryString(debouncedFilters);
  const { data: pool } = useQuery({
    queryKey: ["recommend-pool", qs],
    queryFn: ({ signal }) => fetchPool(qs, signal),
    enabled: hasLibrary === true,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const poolItems = useMemo(() => pool?.items ?? [], [pool]);
  const mix = filters.mix ?? "mixed";
  const poolEmpty = !!pool && (pool.movieCount === 0 || (mix === "actors" && pool.actorCount === 0));

  const staleKeys = useMemo(() => {
    const s = new Set<string>();
    for (const c of hand) if (c?.type === "movie" && !movieMatches(c, filters)) s.add(cardKey(c));
    return s;
  }, [hand, filters]);

  // ── persistence (survives a trip to a movie's detail page and back) ──
  useEffect(() => {
    if (phase === "drawing") return;
    try {
      const data: Saved = { filters, hand, locked: [...lockedKeys] };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full / disabled — non-essential
    }
  }, [filters, hand, lockedKeys, phase]);

  // ── toasts ──
  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // ── ambient backdrop ──
  const showAmbient = useCallback((path: string | null) => {
    if (path) ambientRef.current?.show(resolveImageSrc(path, 640));
  }, []);
  const onHover = useCallback(
    (card: RecommendCard | null) => {
      if (!card) return;
      lastHoverAt.current = performance.now();
      showAmbient(fanartOf(card));
    },
    [showAmbient]
  );
  // first pool → a random backdrop; then slowly drift while idle
  const latest = useRef({ hand, poolItems, busy });
  useEffect(() => {
    latest.current = { hand, poolItems, busy };
  });
  const seededAmbient = useRef(false);
  useEffect(() => {
    if (seededAmbient.current || !poolItems.length) return;
    seededAmbient.current = true;
    const first = hand.find((c) => c?.type === "movie");
    showAmbient(first ? fanartOf(first) : poolItems[(Math.random() * poolItems.length) | 0].image);
  }, [poolItems, hand, showAmbient]);
  useEffect(() => {
    const id = setInterval(() => {
      const { hand: h, poolItems: items, busy: b } = latest.current;
      if (b || document.hidden || performance.now() - lastHoverAt.current < IDLE_AMBIENT_MS) return;
      const movies = h.filter((c): c is MovieCardData => c?.type === "movie");
      if (movies.length) showAmbient(fanartOf(movies[(Math.random() * movies.length) | 0]));
      else if (items.length) showAmbient(items[(Math.random() * items.length) | 0].image);
    }, IDLE_AMBIENT_MS);
    return () => clearInterval(id);
  }, [showAmbient]);

  // ── draw ──
  const draw = useCallback(async () => {
    if (busyRef.current || hasLibrary !== true) return;
    if (poolEmpty) {
      showToast(t("toastEmpty"), false);
      return;
    }
    const kept = hand.map((c) => (c && lockedKeys.has(cardKey(c)) ? c : null));
    const free = kept.filter((c) => !c).length;
    if (!free) {
      showToast(t("toastAllLocked"), false);
      return;
    }
    busyRef.current = true;
    genRef.current++;
    setBusy(true);
    setHand(kept);
    setPhase("drawing");
    setDrawToken((n) => n + 1);

    const need = computeNeed(kept, filters.mix, free);
    const t0 = performance.now();
    const lead = reducedMotion ? 150 : scene.drawLeadMs;
    const finish = (ms: number) =>
      setTimeout(() => {
        busyRef.current = false;
        setBusy(false);
      }, ms);
    try {
      const res = await postDraw({
        filters,
        movies: need.movies,
        actors: need.actors,
        exclude: kept.filter((c): c is RecommendCard => !!c).map(toRef),
      });
      const wait = lead - (performance.now() - t0);
      if (wait > 0) await sleep(wait);
      const next = placeCards(kept, res.cards);
      setHand(next);
      setPhase(next.some(Boolean) ? "dealt" : "idle");
      if (!res.cards.length) showToast(t("toastEmpty"), false);
      else if (res.cards.length < free) showToast(t("toastPartial", { count: res.cards.length }), false);
      else if (res.repeatsAllowed) showToast(t("toastRepeats"));
      const firstMovie = res.cards.find((c) => c.type === "movie");
      if (firstMovie) setTimeout(() => showAmbient(fanartOf(firstMovie)), 500);
      finish(reducedMotion ? 300 : scene.dealMs);
    } catch {
      const wait = Math.min(lead, 600) - (performance.now() - t0);
      if (wait > 0) await sleep(wait);
      setPhase(kept.some(Boolean) ? "dealt" : "idle");
      showToast(t("toastError"), false);
      finish(0);
    }
  }, [hasLibrary, poolEmpty, hand, lockedKeys, filters, reducedMotion, scene, showToast, showAmbient, t]);

  // ── card actions ──
  const onToggleLock = useCallback((card: RecommendCard) => {
    const key = cardKey(card);
    setLockedKeys((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  const onDismiss = useCallback(
    async (card: RecommendCard) => {
      if (busyRef.current) return;
      const key = cardKey(card);
      const slot = hand.findIndex((c) => c && cardKey(c) === key);
      if (slot < 0) return;
      const gen = genRef.current;
      postHistory({ type: card.type, id: card.id, action: "dismissed" }).catch(() => {});
      const remaining = hand.map((c, i) => (i === slot ? null : c));
      setHand(remaining);
      setLockedKeys((s) => {
        if (!s.has(key)) return s;
        const n = new Set(s);
        n.delete(key);
        return n;
      });

      // refill that slot with one card of the kind the mix wants there
      const m = filters.mix ?? "mixed";
      const kind = m === "actors" ? "person" : m === "movies" ? "movie" : card.type;
      const t0 = performance.now();
      try {
        const res = await postDraw({
          filters,
          movies: kind === "movie" ? 1 : 0,
          actors: kind === "person" ? 1 : 0,
          exclude: [...remaining.filter((c): c is RecommendCard => !!c).map(toRef), toRef(card)],
        });
        const wait = REFILL_MIN_MS - (performance.now() - t0);
        if (wait > 0) await sleep(wait);
        const next = res.cards[0];
        if (!next || gen !== genRef.current) {
          if (!next) showToast(t("toastNoMore"), false);
          return;
        }
        const nk = cardKey(next);
        setHand((h) => {
          if (h[slot] || h.some((c) => c && cardKey(c) === nk)) return h;
          const n = [...h];
          n[slot] = next;
          return n;
        });
      } catch {
        showToast(t("toastError"), false);
      }
    },
    [hand, filters, showToast, t]
  );

  const onOpenMovie = useCallback(
    (card: MovieCardData, poster: HTMLElement | null) => {
      startPosterViewTransition(`/movies/${card.id}`, poster, (href) => router.push(href));
    },
    [router]
  );
  const onPlay = useCallback((card: MovieCardData) => router.push(`/movies/${card.id}/play`), [router]);
  const onOpenPerson = useCallback((card: ActorCardData) => router.push(`/people/${card.id}`), [router]);

  // ── filters ──
  const onPreset = useCallback((p: RecommendPreset) => {
    setFilters((f) => (f.preset === p ? DEFAULT_FILTERS : { ...RECOMMEND_PRESETS[p] }));
  }, []);
  const onReset = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  // ── keyboard: Space / Enter draw ──
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code !== "Space" && e.key !== "Enter") || e.repeat || drawerOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-rc-card],[role=menu],[role=dialog],[contenteditable=true]")) return;
      const range = target instanceof HTMLInputElement && target.type === "range";
      const control = target?.closest?.("button,a,input,select,textarea,[role=switch],[role=radio],[role=button]");
      // chips / locks keep their own keyboard activation
      if (control && control !== drawBtnRef.current && !range) return;
      e.preventDefault();
      if (range) target.blur();
      drawRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // ── free space for the hand between the filter bar and the draw button ──
  useEffect(() => {
    const root = rootRef.current;
    const bar = barRef.current;
    const wrap = drawWrapRef.current;
    if (!root || !bar || !wrap) return;
    const measure = () => {
      const r = root.getBoundingClientRect();
      const top = Math.round(bar.getBoundingClientRect().bottom - r.top);
      const bottom = Math.round(r.bottom - wrap.getBoundingClientRect().top);
      setInsets((p) => (p.top === top && p.bottom === bottom ? p : { top, bottom }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(bar);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [hasLibrary]);

  const hasHand = hand.some(Boolean);
  const hasDrawn = drawToken > 0 || hasHand;
  const SceneComponent = scene.Component;

  if (hasLibrary === false) {
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#0a0a0f] px-6">
        <div className="max-w-md text-center">
          <h1 className="rc-intro-title">{t("noLibraryTitle")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("noLibraryHint")}</p>
          <Link
            href="/"
            className="mt-6 inline-flex h-10 items-center rounded-full border border-white/20 bg-white/5 px-6 text-sm font-medium text-white/90 transition-fluid hover:bg-white/15 active:scale-95"
          >
            {t("goHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative h-full w-full select-none overflow-hidden bg-[#0a0a0f] text-foreground">
      <AmbientBackdrop ref={ambientRef} />

      <SceneComponent
        pool={poolItems}
        hand={hand}
        phase={phase}
        drawToken={drawToken}
        lockedKeys={lockedKeys}
        staleKeys={staleKeys}
        reducedMotion={reducedMotion}
        insets={insets}
        onOpenMovie={onOpenMovie}
        onPlay={onPlay}
        onToggleLock={onToggleLock}
        onDismiss={onDismiss}
        onOpenPerson={onOpenPerson}
        onHover={onHover}
      />

      {/* top scrim keeps the transparent header legible over the nebula */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-24 bg-gradient-to-b from-black/60 to-transparent" />

      {/* intro, until the first draw */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-[4] w-[min(90%,40rem)] -translate-x-1/2 -translate-y-1/2 text-center transition-opacity duration-700"
        style={{ opacity: hasDrawn || poolEmpty ? 0 : 1 }}
      >
        <h1 className="rc-intro-title">{t("introTitle")}</h1>
        <p className="mt-2.5 text-sm tracking-wide text-[#a3a3bb]">
          {pool ? t("introSub", { count: pool.movieCount }) : " "}
        </p>
      </div>

      {/* empty pool */}
      {poolEmpty && !hasHand && (
        <div className="absolute left-1/2 top-1/2 z-[6] w-[min(90%,28rem)] -translate-x-1/2 -translate-y-1/2 text-center">
          <h2 className="text-2xl font-bold text-white/90">{t("emptyTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("emptyHint")}</p>
          <button
            type="button"
            onClick={onReset}
            className="focus-ring mt-5 inline-flex h-10 cursor-pointer items-center rounded-full border border-white/20 bg-white/5 px-6 text-sm font-medium text-white/90 transition-fluid hover:bg-white/15 active:scale-95"
          >
            {t("relax")}
          </button>
        </div>
      )}

      {/* filter bar — below the transparent app header, outside the 3D subtree */}
      <div ref={barRef} className="pointer-events-none absolute inset-x-0 top-[3.25rem] z-10 px-3.5">
        <FilterBar
          filters={filters}
          onChange={setFilters}
          onPreset={onPreset}
          onReset={onReset}
          genres={filterOptions?.genres ?? []}
          tags={filterOptions?.tags ?? []}
          movieCount={pool?.movieCount ?? null}
          actorCount={pool?.actorCount ?? null}
          theme={theme}
          availableThemes={AVAILABLE_THEMES}
          onTheme={setTheme}
        />
      </div>

      {/* draw */}
      <div
        ref={drawWrapRef}
        className="absolute bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2"
      >
        <button
          ref={drawBtnRef}
          type="button"
          className="rc-draw inline-flex items-center gap-2.5 whitespace-nowrap"
          data-busy={busy}
          disabled={!pool || poolEmpty}
          onClick={() => draw()}
        >
          {hasDrawn ? t("redraw") : t("draw")}
          <Dices className="h-5 w-5" />
        </button>
        <div className="hidden whitespace-nowrap text-[0.71875rem] tracking-wide text-muted-foreground sm:block">
          {t.rich("hint", { k: (chunks) => <kbd className="rc-kbd">{chunks}</kbd> })}
        </div>
      </div>

      {toast &&
        createPortal(
          <GlassToast visible success={toast.ok} className="z-[60] mb-[6.5rem]">
            {toast.msg}
          </GlassToast>,
          document.body
        )}
    </div>
  );
}

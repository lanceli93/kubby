"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  PlaneGeometry,
  MeshBasicMaterial,
  Mesh,
  TextureLoader,
  Texture,
  CanvasTexture,
  SRGBColorSpace,
  LinearFilter,
  LinearMipmapLinearFilter,
  Color,
  Raycaster,
  Vector2,
} from "three";
import { resolveImageSrc } from "@/lib/image-utils";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface PosterWallMovie {
  id: string;
  title: string;
  posterPath?: string | null;
  year?: number | null;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoCodec?: string | null;
  fileSize?: number | null;
  runtimeSeconds?: number | null;
  runtimeMinutes?: number | null;
  communityRating?: number | null;
  personalRating?: number | null;
  dateAdded?: string | null;
}

// Sort dimensions mirror the movies-page sort set (year replaces releaseDate).
type SortKey =
  | "title"
  | "rating"
  | "personalRating"
  | "dateAdded"
  | "year"
  | "runtime"
  | "resolution"
  | "fileSize";

interface PosterWallProps {
  movies: PosterWallMovie[];
  onClose: () => void;
  initialSort?: { key: string; order: "asc" | "desc" };
}

// ---------------------------------------------------------------------------
// Layout constants (world units)
// ---------------------------------------------------------------------------

const POSTER_W = 2;
const POSTER_H = 3; // 2:3 aspect
const SEP_W = 1.7; // separator divider card
const SEP_H = 2.55;

// Cover Flow transform regime
const FOCUS_Z = 2.2; // focused item pops toward the camera
const FOCUS_SCALE = 1.35;
const SIDE_ROT = 1.05; // radians the side stacks rotate (record-crate look)
const SIDE_BASE_X = 2.1; // x of the first side item
const SIDE_STEP_X = 0.62; // extra x per additional |d|
const HOVER_LIFT = 0.08;

const PLACEHOLDER_COLOR = 0x181822;
const SEP_PLACEHOLDER_COLOR = 0x101018;

const TEXTURE_CONCURRENCY = 6;
const RESIDENT_WINDOW = 60; // keep textures within ±60 of focus
const RESIDENT_CAP = 140; // hard cap on resident textures

// Framerate-independent easing time constant (ms) — matches tilt-card idiom.
const EASE_TAU = 120;
const FOCUS_TAU = 140;

// ---------------------------------------------------------------------------
// Formatting helpers (mirror the detail page / media-info dialog)
// ---------------------------------------------------------------------------

function getResolutionLabel(width?: number | null, height?: number | null): string | null {
  const w = width || 0;
  const h = height || 0;
  if (w >= 8000) return "8K";
  if (w >= 7000) return "7K";
  if (w >= 6000) return "6K";
  if (w >= 5000) return "5K";
  if (w >= 3500) return "4K";
  if (w >= 3000) return "3K";
  if (w >= 2500) return "2K";
  if (w >= 1920) return "FHD";
  if (w >= 1280) return "HD";
  if (h >= 576) return "576P";
  if (h >= 480) return "480P";
  if (h >= 360) return "360P";
  if (h > 0 || w > 0) return "240P";
  return null;
}

// Coarse tier used for resolution grouping (fold the fine labels into buckets).
function getResolutionTier(width?: number | null, height?: number | null): string | null {
  const w = width || 0;
  if (w <= 0 && (height || 0) <= 0) return null;
  if (w >= 3500) return "4K";
  if (w >= 2500) return "2K";
  if (w >= 1920) return "FHD";
  if (w >= 1280) return "HD";
  return "SD";
}

function formatFileSize(bytes?: number | null): string | null {
  if (bytes == null || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : i >= 3 ? 2 : 1)} ${units[i]}`;
}

function runtimeSecondsOf(m: PosterWallMovie): number {
  return m.runtimeSeconds || (m.runtimeMinutes ? m.runtimeMinutes * 60 : 0);
}

function formatRuntime(secs: number): string | null {
  if (secs <= 0) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${secs}s`;
}

// ---------------------------------------------------------------------------
// Sorting + grouping
// ---------------------------------------------------------------------------

const VALID_SORT_KEYS: SortKey[] = [
  "title",
  "rating",
  "personalRating",
  "dateAdded",
  "year",
  "runtime",
  "resolution",
  "fileSize",
];

// Numeric key for a movie under a sort dimension. Null = missing metadata
// (sorted last regardless of direction).
function sortValue(m: PosterWallMovie, key: SortKey): number | string | null {
  switch (key) {
    case "title":
      return m.title || "";
    case "rating":
      return m.communityRating ?? null;
    case "personalRating":
      return m.personalRating ?? null;
    case "dateAdded":
      return m.dateAdded ? Date.parse(m.dateAdded) || null : null;
    case "year":
      return m.year ?? null;
    case "runtime": {
      const s = runtimeSecondsOf(m);
      return s > 0 ? s : null;
    }
    case "resolution":
      return m.videoWidth && m.videoWidth > 0 ? m.videoWidth : null;
    case "fileSize":
      return m.fileSize && m.fileSize > 0 ? m.fileSize : null;
  }
}

// Group label for a movie under the active sort dimension, or null if this
// dimension has no separators (title / dateAdded / runtime).
function groupLabel(m: PosterWallMovie, key: SortKey): string | null {
  switch (key) {
    case "year": {
      if (!m.year) return null;
      const decade = Math.floor(m.year / 10) * 10;
      return `${decade}s`;
    }
    case "resolution":
      return getResolutionTier(m.videoWidth, m.videoHeight);
    case "rating": {
      const r = m.communityRating;
      if (r == null) return null;
      if (r >= 9) return "★ 9+";
      if (r >= 8) return "★ 8–9";
      if (r >= 7) return "★ 7–8";
      return "★ <7";
    }
    case "personalRating": {
      const r = m.personalRating;
      if (r == null) return null;
      if (r >= 9) return "★ 9+";
      if (r >= 8) return "★ 8–9";
      if (r >= 7) return "★ 7–8";
      return "★ <7";
    }
    case "fileSize": {
      const b = m.fileSize;
      if (b == null || b <= 0) return null;
      const gb = b / (1024 * 1024 * 1024);
      if (gb >= 20) return "20 GB+";
      if (gb >= 5) return "5–20 GB";
      if (gb >= 1) return "1–5 GB";
      return "<1 GB";
    }
    // title / dateAdded / runtime → no separators
    default:
      return null;
  }
}

const MISSING_GROUP = "—";

interface FlowMovieItem {
  kind: "movie";
  movie: PosterWallMovie;
}
interface FlowSepItem {
  kind: "separator";
  label: string;
  count: number;
}
type FlowItem = FlowMovieItem | FlowSepItem;

// Build the ordered flow (movies + interleaved separator cards) for a sort.
function buildFlow(
  movies: PosterWallMovie[],
  key: SortKey,
  order: "asc" | "desc",
): FlowItem[] {
  const dir = order === "asc" ? 1 : -1;

  const sorted = [...movies].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    // nulls last regardless of direction
    if (va == null && vb == null) return a.title.localeCompare(b.title);
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" || typeof vb === "string") {
      const cmp = String(va).localeCompare(String(vb));
      return cmp * dir;
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return a.title.localeCompare(b.title);
  });

  const hasGroups = key === "year" || key === "resolution" || key === "rating" ||
    key === "personalRating" || key === "fileSize";

  if (!hasGroups) {
    return sorted.map((movie) => ({ kind: "movie", movie }));
  }

  // Interleave separator cards ahead of each new group. Missing-metadata items
  // land in a trailing "—" group.
  const flow: FlowItem[] = [];
  let curLabel: string | null | undefined = undefined;
  let curCount = 0;
  let sepIndex = -1;
  for (const movie of sorted) {
    const label = groupLabel(movie, key) ?? MISSING_GROUP;
    if (label !== curLabel) {
      if (sepIndex >= 0) (flow[sepIndex] as FlowSepItem).count = curCount;
      sepIndex = flow.length;
      flow.push({ kind: "separator", label, count: 0 });
      curLabel = label;
      curCount = 0;
    }
    flow.push({ kind: "movie", movie });
    curCount++;
  }
  if (sepIndex >= 0) (flow[sepIndex] as FlowSepItem).count = curCount;
  return flow;
}

// ---------------------------------------------------------------------------
// Canvas texture generators (reflection alpha gradient, separator card, bg)
// ---------------------------------------------------------------------------

function makeReflectionAlphaMap(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  // The mirrored mesh is flipped (scale.y = -1); "top" of this map lands at the
  // poster's base and fades to nothing further down.
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.5, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeBackgroundTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#0e0e16");
  g.addColorStop(1, "#06060a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeSeparatorTexture(label: string, count: number): CanvasTexture {
  const W = 384;
  const H = 576; // 2:3, matches SEP card aspect
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  // Dark frosted card
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(26,26,38,0.96)");
  g.addColorStop(1, "rgba(12,12,20,0.96)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Border
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  // Big centered label (auto-shrink to fit)
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fontSize = 68;
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
  while (ctx.measureText(label).width > W - 60 && fontSize > 24) {
    fontSize -= 4;
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
  }
  ctx.fillText(label, W / 2, H / 2 - 20);

  // Count line
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "400 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(String(count), W / 2, H / 2 + 44);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// HUD data (updates only on integer-focus change, never per-frame)
// ---------------------------------------------------------------------------

interface HudData {
  kind: "movie" | "separator" | "empty";
  title: string;
  meta?: {
    year?: number | null;
    resolution?: string | null;
    codec?: string | null;
    fileSize?: string | null;
    runtime?: string | null;
    communityRating?: number | null;
    personalRating?: number | null;
  };
  sublabel?: string; // for separators: count line
}

function movieHud(m: PosterWallMovie): HudData {
  return {
    kind: "movie",
    title: m.title,
    meta: {
      year: m.year,
      resolution: getResolutionLabel(m.videoWidth, m.videoHeight),
      codec: m.videoCodec,
      fileSize: formatFileSize(m.fileSize),
      runtime: formatRuntime(runtimeSecondsOf(m)),
      communityRating: m.communityRating,
      personalRating: m.personalRating,
    },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SORT_ICON: Record<SortKey, string> = {
  title: "titleAZ",
  rating: "rating",
  personalRating: "personalRating",
  dateAdded: "dateAdded",
  year: "year",
  runtime: "runtime",
  resolution: "resolution",
  fileSize: "fileSize",
};

export function PosterWall({ movies, onClose, initialSort }: PosterWallProps) {
  const t = useTranslations("movies");
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const routerRef = useRef(router);
  routerRef.current = router;

  // Sort state lives in React (drives flying reorder + pill highlight).
  const initialKey: SortKey =
    initialSort && VALID_SORT_KEYS.includes(initialSort.key as SortKey)
      ? (initialSort.key as SortKey)
      : "dateAdded";
  const [sortKey, setSortKey] = useState<SortKey>(initialKey);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(initialSort?.order ?? "desc");

  // HUD state — updated only when integer focus changes.
  const [hud, setHud] = useState<HudData | null>(null);

  // Imperative bridge the WebGL effect installs so pill clicks can retarget
  // the scene without tearing down the renderer.
  const applySortRef = useRef<((key: SortKey, order: "asc" | "desc") => void) | null>(null);

  const isEmpty = movies.length === 0;

  useEffect(() => {
    const container = containerRef.current;
    if (isEmpty || !container) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new Scene();
    scene.background = new Color(0x06060a);

    // Big unlit gradient plane far behind everything for depth.
    const bgTexture = makeBackgroundTexture();
    const bgGeo = new PlaneGeometry(60, 34);
    const bgMat = new MeshBasicMaterial({ map: bgTexture, depthWrite: false });
    const bgMesh = new Mesh(bgGeo, bgMat);
    bgMesh.position.set(0, 0, -8);
    scene.add(bgMesh);

    const camera = new PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      200,
    );
    camera.position.set(0, 0.35, 7.5);
    camera.lookAt(0, 0, 0);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x06060a, 1);
    container.appendChild(renderer.domElement);
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const canvas = renderer.domElement;

    // Shared disposables
    const reflectionAlpha = makeReflectionAlphaMap();
    // Shared geometries (one per card kind + its reflection)
    const posterGeo = new PlaneGeometry(POSTER_W, POSTER_H);
    const sepGeo = new PlaneGeometry(SEP_W, SEP_H);

    // ---- Per-item tiles -------------------------------------------------
    interface Tile {
      key: string; // stable id (movie id or separator synthetic key)
      item: FlowItem;
      mesh: Mesh;
      material: MeshBasicMaterial;
      reflMesh: Mesh;
      reflMaterial: MeshBasicMaterial;
      halfH: number; // half height of the card (for reflection offset)
      // eased transform state
      cur: { x: number; y: number; z: number; rotY: number; scale: number };
      target: { x: number; y: number; z: number; rotY: number; scale: number };
      // texture state
      texture: Texture | null; // poster texture (movies only)
      sepTexture: CanvasTexture | null; // separator texture
      loading: boolean;
      hoverLift: number; // 0 or HOVER_LIFT eased in
    }

    const tiles: Tile[] = [];
    const tileByMesh = new Map<Mesh, Tile>();
    const pickMeshes: Mesh[] = [];

    let sepCounter = 0;
    const buildTiles = (flow: FlowItem[]) => {
      // Dispose any previous tiles
      for (const tile of tiles) {
        scene.remove(tile.mesh);
        scene.remove(tile.reflMesh);
        tile.material.dispose();
        tile.reflMaterial.dispose();
        if (tile.texture) tile.texture.dispose();
        if (tile.sepTexture) tile.sepTexture.dispose();
      }
      tiles.length = 0;
      tileByMesh.clear();
      pickMeshes.length = 0;

      for (const item of flow) {
        const isSep = item.kind === "separator";
        const geo = isSep ? sepGeo : posterGeo;
        const halfH = (isSep ? SEP_H : POSTER_H) / 2;

        const material = new MeshBasicMaterial({
          color: isSep ? SEP_PLACEHOLDER_COLOR : PLACEHOLDER_COLOR,
          transparent: false,
        });
        const mesh = new Mesh(geo, material);

        const reflMaterial = new MeshBasicMaterial({
          color: isSep ? SEP_PLACEHOLDER_COLOR : PLACEHOLDER_COLOR,
          transparent: true,
          opacity: isSep ? 0.14 : 0.28,
          depthWrite: false,
          alphaMap: reflectionAlpha,
        });
        const reflMesh = new Mesh(geo, reflMaterial);
        reflMesh.scale.y = -1;

        let sepTexture: CanvasTexture | null = null;
        if (isSep) {
          sepTexture = makeSeparatorTexture(item.label, item.count);
          sepTexture.anisotropy = maxAniso;
          material.map = sepTexture;
          material.color.set(0xffffff);
          material.needsUpdate = true;
          reflMaterial.map = sepTexture;
          reflMaterial.color.set(0xffffff);
          reflMaterial.needsUpdate = true;
        }

        scene.add(mesh);
        scene.add(reflMesh);

        const key = isSep ? `__sep_${sepCounter++}` : item.movie.id;
        const tile: Tile = {
          key,
          item,
          mesh,
          material,
          reflMesh,
          reflMaterial,
          halfH,
          cur: { x: 0, y: 0, z: 0, rotY: 0, scale: 1 },
          target: { x: 0, y: 0, z: 0, rotY: 0, scale: 1 },
          texture: null,
          sepTexture,
          loading: false,
          hoverLift: 0,
        };
        tiles.push(tile);
        tileByMesh.set(mesh, tile);
        if (!isSep) pickMeshes.push(mesh);
      }
    };

    // ---- Cover Flow transform target from continuous d = index - focus ---
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const computeTarget = (index: number, focus: number, tile: Tile) => {
      const d = index - focus;
      const ad = Math.abs(d);
      const sign = d === 0 ? 0 : d > 0 ? 1 : -1;

      // Focused regime (d = 0)
      const fx = 0;
      const fz = FOCUS_Z;
      const fr = 0;
      const fs = FOCUS_SCALE;

      // Side regime (|d| >= 1)
      const sx = sign * (SIDE_BASE_X + (ad - 1) * SIDE_STEP_X);
      const sz = 0;
      const sr = -sign * SIDE_ROT;
      const ss = 1;

      let x: number, z: number, rotY: number, scale: number;
      if (ad >= 1) {
        x = sx;
        z = sz;
        rotY = sr;
        scale = ss;
      } else {
        // Blend the two regimes for 0 < |d| < 1 so scrubbing is continuous.
        const tt = ad; // 0 at focus, 1 at first side slot
        x = lerp(fx, sign * SIDE_BASE_X, tt);
        z = lerp(fz, sz, tt);
        rotY = lerp(fr, -sign * SIDE_ROT, tt);
        scale = lerp(fs, ss, tt);
      }

      tile.target.x = x;
      tile.target.y = tile.hoverLift;
      tile.target.z = z;
      tile.target.rotY = rotY;
      tile.target.scale = scale;
    };

    // ---- Focus / scrub state -------------------------------------------
    let focusFloat = 0; // continuous
    let targetFocus = 0; // integer we ease toward
    let lastHudIndex = -1;

    const clampFocusInt = (v: number) =>
      Math.max(0, Math.min(tiles.length - 1, Math.round(v)));

    const updateHud = (idx: number) => {
      if (idx === lastHudIndex) return;
      lastHudIndex = idx;
      const tile = tiles[idx];
      if (!tile) return;
      if (tile.item.kind === "separator") {
        setHud({
          kind: "separator",
          title: tile.item.label,
          sublabel: String(tile.item.count),
        });
      } else {
        setHud(movieHud(tile.item.movie));
      }
    };

    // ---- Texture LRU streaming -----------------------------------------
    const loader = new TextureLoader();
    let inFlight = 0;
    let disposed = false;

    const disposeTileTexture = (tile: Tile) => {
      if (tile.texture) {
        tile.texture.dispose();
        tile.texture = null;
        tile.material.map = null;
        tile.material.color.set(PLACEHOLDER_COLOR);
        tile.material.needsUpdate = true;
        tile.reflMaterial.map = null;
        tile.reflMaterial.color.set(PLACEHOLDER_COLOR);
        tile.reflMaterial.needsUpdate = true;
      }
    };

    const loadTile = (tile: Tile) => {
      if (tile.loading || tile.texture || tile.item.kind !== "movie") return;
      const posterPath = tile.item.movie.posterPath;
      if (!posterPath) return;
      tile.loading = true;
      inFlight++;
      const src = resolveImageSrc(posterPath, 480);
      loader.load(
        src,
        (texture) => {
          inFlight--;
          tile.loading = false;
          if (disposed) {
            texture.dispose();
            return;
          }
          // If this tile was evicted while loading, drop the texture.
          const idx = tiles.indexOf(tile);
          if (idx < 0 || Math.abs(idx - focusFloat) > RESIDENT_WINDOW) {
            texture.dispose();
            pump();
            return;
          }
          texture.colorSpace = SRGBColorSpace;
          texture.generateMipmaps = true;
          texture.minFilter = LinearMipmapLinearFilter;
          texture.magFilter = LinearFilter;
          texture.anisotropy = maxAniso;
          tile.texture = texture;
          tile.material.map = texture;
          tile.material.color.set(0xffffff);
          tile.material.needsUpdate = true;
          tile.reflMaterial.map = texture;
          tile.reflMaterial.color.set(0xffffff);
          tile.reflMaterial.needsUpdate = true;
          renderOnce();
          pump();
        },
        undefined,
        () => {
          inFlight--;
          tile.loading = false;
          pump();
        },
      );
    };

    // Prioritized queue: candidates within the resident window, nearest focus
    // first. Called on focus settle (cheap re-sort of the pending set).
    const pump = () => {
      if (disposed) return;
      // Evict textures outside the resident window (or over the cap).
      const focusI = focusFloat;
      // Distance-sorted list of tiles that currently hold textures.
      const resident: { tile: Tile; dist: number }[] = [];
      for (const tile of tiles) {
        if (tile.texture) {
          const dist = Math.abs(tiles.indexOf(tile) - focusI);
          if (dist > RESIDENT_WINDOW) {
            disposeTileTexture(tile);
          } else {
            resident.push({ tile, dist });
          }
        }
      }
      // Enforce cap: drop the farthest resident textures beyond RESIDENT_CAP.
      if (resident.length > RESIDENT_CAP) {
        resident.sort((a, b) => b.dist - a.dist);
        for (let i = 0; i < resident.length - RESIDENT_CAP; i++) {
          disposeTileTexture(resident[i].tile);
        }
      }

      // Build the pending candidate list within the window, nearest first.
      const pending: { tile: Tile; dist: number }[] = [];
      for (let i = 0; i < tiles.length; i++) {
        const dist = Math.abs(i - focusI);
        if (dist > RESIDENT_WINDOW) continue;
        const tile = tiles[i];
        if (tile.item.kind !== "movie") continue;
        if (tile.texture || tile.loading || !tile.item.movie.posterPath) continue;
        pending.push({ tile, dist });
      }
      pending.sort((a, b) => a.dist - b.dist);

      let pi = 0;
      while (inFlight < TEXTURE_CONCURRENCY && pi < pending.length) {
        loadTile(pending[pi++].tile);
      }
    };

    // ---- Render loop (framerate-independent exponential smoothing) -------
    let rafId = 0;
    let loopRunning = false;
    let lastTs = 0;

    const renderOnce = () => {
      if (!loopRunning) renderer.render(scene, camera);
    };

    const applyTile = (tile: Tile) => {
      const c = tile.cur;
      tile.mesh.position.set(c.x, c.y, c.z);
      tile.mesh.rotation.y = c.rotY;
      tile.mesh.scale.setScalar(c.scale);
      // Reflection: mirrored beneath the card. Its own scale.y is -1, so the
      // group scale must stay positive; place it just below the card base.
      tile.reflMesh.position.set(c.x, c.y - tile.halfH * c.scale * 2, c.z);
      tile.reflMesh.rotation.y = c.rotY;
      tile.reflMesh.scale.set(c.scale, -c.scale, c.scale);
      // Depth ordering: nearer-to-focus cards render on top.
      tile.mesh.renderOrder = c.z;
    };

    const animate = (ts: number) => {
      const dt = Math.min(64, ts - lastTs || 16);
      lastTs = ts;
      const kFocus = reducedMotion ? 1 : 1 - Math.exp(-dt / FOCUS_TAU);
      const kEase = reducedMotion ? 1 : 1 - Math.exp(-dt / EASE_TAU);

      // Ease focusFloat toward the integer target.
      focusFloat += (targetFocus - focusFloat) * kFocus;
      if (Math.abs(targetFocus - focusFloat) < 0.001) focusFloat = targetFocus;

      let anyMoving = Math.abs(targetFocus - focusFloat) > 0.0005;

      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        computeTarget(i, focusFloat, tile);
        const c = tile.cur;
        const tg = tile.target;
        c.x += (tg.x - c.x) * kEase;
        c.y += (tg.y - c.y) * kEase;
        c.z += (tg.z - c.z) * kEase;
        c.rotY += (tg.rotY - c.rotY) * kEase;
        c.scale += (tg.scale - c.scale) * kEase;
        const settled =
          Math.abs(tg.x - c.x) < 0.001 &&
          Math.abs(tg.y - c.y) < 0.001 &&
          Math.abs(tg.z - c.z) < 0.001 &&
          Math.abs(tg.rotY - c.rotY) < 0.001 &&
          Math.abs(tg.scale - c.scale) < 0.001;
        if (!settled) anyMoving = true;
        applyTile(tile);
      }

      updateHud(clampFocusInt(focusFloat));
      renderer.render(scene, camera);

      if (!anyMoving) {
        loopRunning = false;
        pump(); // re-prioritize textures now that focus has settled
        return;
      }
      rafId = requestAnimationFrame(animate);
    };

    const startLoop = () => {
      if (loopRunning || disposed || document.hidden) return;
      loopRunning = true;
      lastTs = 0;
      rafId = requestAnimationFrame(animate);
    };

    // ---- Focus mutation helpers ----------------------------------------
    const setFocus = (v: number) => {
      targetFocus = Math.max(0, Math.min(tiles.length - 1, Math.round(v)));
      pump();
      startLoop();
    };

    // ---- Sort application (flying reorder) -----------------------------
    // Rebuild the flow, remembering which movie was focused so we re-center on
    // it. Textures for the new window stream in; the meshes fly to new targets.
    const applySort = (key: SortKey, order: "asc" | "desc") => {
      const prevTile = tiles[clampFocusInt(focusFloat)];
      const prevMovieId =
        prevTile && prevTile.item.kind === "movie" ? prevTile.item.movie.id : null;

      const flow = buildFlow(movies, key, order);
      buildTiles(flow);

      // Re-center on the previously focused movie if it still exists.
      let newFocus = 0;
      if (prevMovieId) {
        const idx = tiles.findIndex(
          (tl) => tl.item.kind === "movie" && tl.item.movie.id === prevMovieId,
        );
        if (idx >= 0) newFocus = idx;
      }
      // If we landed on a separator, nudge to the adjacent movie.
      if (tiles[newFocus] && tiles[newFocus].item.kind === "separator") {
        if (tiles[newFocus + 1]) newFocus += 1;
      }

      // Seed current transforms from targets at the new focus so the reorder
      // animates from a sensible pose rather than all-at-origin.
      focusFloat = newFocus;
      targetFocus = newFocus;
      for (let i = 0; i < tiles.length; i++) {
        computeTarget(i, focusFloat, tiles[i]);
        // start slightly off so the ease has something to animate
        const tg = tiles[i].target;
        tiles[i].cur = { ...tg, scale: reducedMotion ? tg.scale : tg.scale * 0.96 };
      }
      lastHudIndex = -1;
      updateHud(clampFocusInt(focusFloat));
      pump();
      if (reducedMotion) {
        for (const tile of tiles) applyTile(tile);
        renderOnce();
      } else {
        startLoop();
      }
    };
    applySortRef.current = applySort;

    // Initial build
    applySort(sortKey, sortOrder);

    // ---- Interaction: wheel --------------------------------------------
    let wheelAccum = 0;
    const WHEEL_THRESHOLD = 100;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelAccum += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      while (Math.abs(wheelAccum) >= WHEEL_THRESHOLD) {
        const step = wheelAccum > 0 ? 1 : -1;
        setFocus(targetFocus + step);
        wheelAccum -= step * WHEEL_THRESHOLD;
      }
    };

    // ---- Interaction: drag scrub ---------------------------------------
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let isDragging = false;
    let dragMoved = false;
    let lastPointerX = 0;
    let dragStartFocus = 0;
    let dragAccumX = 0;
    let velocity = 0; // items/frame estimate
    let lastMoveTs = 0;
    const DRAG_PX_PER_ITEM = 120;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      dragMoved = false;
      lastPointerX = e.clientX;
      dragStartFocus = focusFloat;
      dragAccumX = 0;
      velocity = 0;
      lastMoveTs = performance.now();
      // Capture can throw if the pointer is already gone (e.g. pointercancel).
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      canvas.style.cursor = "grabbing";
    };

    const updatePointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerMove = (e: PointerEvent) => {
      updatePointer(e);
      if (isDragging) {
        const dx = e.clientX - lastPointerX;
        if (Math.abs(e.clientX - lastPointerX) > 2) dragMoved = true;
        lastPointerX = e.clientX;
        dragAccumX += dx;
        // Dragging right moves earlier items into focus.
        focusFloat = Math.max(
          0,
          Math.min(tiles.length - 1, dragStartFocus - dragAccumX / DRAG_PX_PER_ITEM),
        );
        targetFocus = clampFocusInt(focusFloat);
        const now = performance.now();
        const dtv = Math.max(1, now - lastMoveTs);
        velocity = (-dx / DRAG_PX_PER_ITEM) / (dtv / 16);
        lastMoveTs = now;
        startLoop();
      } else {
        updateHover();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isDragging) {
        // Velocity flick: project, clamp to ±6 items.
        const flick = Math.max(-6, Math.min(6, Math.round(velocity * 8)));
        setFocus(clampFocusInt(focusFloat) + flick);
      }
      isDragging = false;
      try {
        canvas.releasePointerCapture?.(e.pointerId);
      } catch {}
      canvas.style.cursor = hoveredTile ? "pointer" : "grab";
    };

    // ---- Hover raycast --------------------------------------------------
    let hoveredTile: Tile | null = null;
    const updateHover = () => {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(
        tiles.map((tl) => tl.mesh),
        false,
      );
      const nextMesh = (hits[0]?.object as Mesh) ?? null;
      const next = nextMesh ? tileByMesh.get(nextMesh) ?? null : null;
      if (next === hoveredTile) return;
      // Reset previous side-item lift
      if (hoveredTile) hoveredTile.hoverLift = 0;
      hoveredTile = next;
      if (hoveredTile) {
        const focusedIdx = clampFocusInt(focusFloat);
        const isFocused = tiles[focusedIdx] === hoveredTile;
        // Side posters lift slightly; focused poster does not.
        if (!isFocused && hoveredTile.item.kind === "movie") {
          hoveredTile.hoverLift = HOVER_LIFT;
        }
        canvas.style.cursor = "pointer";
        startLoop();
      } else {
        canvas.style.cursor = "grab";
      }
    };

    const onClick = () => {
      if (dragMoved || !hoveredTile) return;
      const focusedIdx = clampFocusInt(focusFloat);
      const isFocused = tiles[focusedIdx] === hoveredTile;
      if (isFocused) {
        // Clicking the focused poster opens it (separators are not clickable).
        if (hoveredTile.item.kind === "movie") {
          onCloseRef.current();
          routerRef.current.push(`/movies/${hoveredTile.item.movie.id}`);
        }
      } else {
        // Clicking a side item focuses it.
        const idx = tiles.indexOf(hoveredTile);
        if (idx >= 0) setFocus(idx);
      }
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("click", onClick);

    // ---- Keyboard -------------------------------------------------------
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          setFocus(targetFocus - 1);
          break;
        case "ArrowRight":
          e.preventDefault();
          setFocus(targetFocus + 1);
          break;
        case "PageUp":
          e.preventDefault();
          setFocus(targetFocus - 10);
          break;
        case "PageDown":
          e.preventDefault();
          setFocus(targetFocus + 10);
          break;
        case "Home":
          e.preventDefault();
          setFocus(0);
          break;
        case "End":
          e.preventDefault();
          setFocus(tiles.length - 1);
          break;
        case "Enter": {
          e.preventDefault();
          const tile = tiles[clampFocusInt(focusFloat)];
          if (tile && tile.item.kind === "movie") {
            onCloseRef.current();
            routerRef.current.push(`/movies/${tile.item.movie.id}`);
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          onCloseRef.current();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // ---- Visibility / resize -------------------------------------------
    const onVisibility = () => {
      if (document.hidden) {
        loopRunning = false;
        cancelAnimationFrame(rafId);
      } else {
        startLoop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderOnce();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // ---- Teardown -------------------------------------------------------
    return () => {
      disposed = true;
      loopRunning = false;
      applySortRef.current = null;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("click", onClick);
      resizeObserver.disconnect();
      for (const tile of tiles) {
        tile.material.dispose();
        tile.reflMaterial.dispose();
        if (tile.texture) tile.texture.dispose();
        if (tile.sepTexture) tile.sepTexture.dispose();
      }
      posterGeo.dispose();
      sepGeo.dispose();
      bgGeo.dispose();
      bgMat.dispose();
      bgTexture.dispose();
      reflectionAlpha.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
    // movies is a stable snapshot passed once when the wall opens; the effect
    // owns its own sort state via applySortRef, so it must not re-run on
    // sort changes (that would tear down + rebuild the whole renderer).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies, isEmpty]);

  // Pill click → retarget the live scene without re-mounting WebGL.
  const handleSort = (key: SortKey) => {
    let nextOrder = sortOrder;
    if (key === sortKey) {
      nextOrder = sortOrder === "asc" ? "desc" : "asc";
      setSortOrder(nextOrder);
    } else {
      // Sensible default direction per dimension.
      nextOrder = key === "title" ? "asc" : "desc";
      setSortKey(key);
      setSortOrder(nextOrder);
    }
    applySortRef.current?.(key, nextOrder);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#06060a]">
      <div ref={containerRef} className="absolute inset-0" style={{ touchAction: "none" }} />

      {/* Empty state */}
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="glass-card rounded-2xl px-8 py-6 text-muted-foreground">
            {t("noMovies")}
          </div>
        </div>
      )}

      {/* Exit button */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="glass-btn absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-fluid hover:text-foreground active:scale-95 cursor-pointer"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Sort pills (top-center, horizontally scrollable) */}
      {!isEmpty && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 flex max-w-[calc(100vw-8rem)] -translate-x-1/2 justify-center">
          <div className="pointer-events-auto flex gap-1.5 overflow-x-auto rounded-full p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {VALID_SORT_KEYS.map((key) => {
              const active = key === sortKey;
              return (
                <button
                  key={key}
                  onClick={() => handleSort(key)}
                  className={`glass-btn flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-fluid cursor-pointer ${
                    active
                      ? "!bg-primary/25 !border-primary/50 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(SORT_ICON[key])}
                  {active && <span>{sortOrder === "asc" ? "↑" : "↓"}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Metadata HUD (bottom-center) */}
      {!isEmpty && hud && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 px-4 text-center">
          <div className="glass-card mx-auto max-w-[90vw] rounded-2xl px-6 py-3">
            <div className="max-w-[80vw] truncate text-lg font-semibold text-foreground">
              {hud.title}
            </div>
            {hud.kind === "separator" ? (
              <div className="mt-1 text-sm text-muted-foreground">{hud.sublabel}</div>
            ) : hud.meta ? (
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-white/70">
                {hud.meta.year ? <span>{hud.meta.year}</span> : null}
                {hud.meta.resolution ? (
                  <span className="rounded-sm border border-white/30 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white/90">
                    {hud.meta.resolution}
                  </span>
                ) : null}
                {hud.meta.codec ? (
                  <span className="uppercase">{hud.meta.codec}</span>
                ) : null}
                {hud.meta.fileSize ? <span>{hud.meta.fileSize}</span> : null}
                {hud.meta.runtime ? <span>{hud.meta.runtime}</span> : null}
                {hud.meta.communityRating != null && hud.meta.communityRating > 0 ? (
                  <span className="font-semibold text-purple-400">
                    ★ {hud.meta.communityRating.toFixed(1)}
                  </span>
                ) : null}
                {hud.meta.personalRating != null && hud.meta.personalRating > 0 ? (
                  <span className="font-semibold text-[var(--gold)]">
                    ★ {hud.meta.personalRating.toFixed(1)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

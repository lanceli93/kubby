"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
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
  // True while the parent's progressive fetch is still pulling pages; drives a
  // subtle "loading more" indicator without gating the wall's interactivity.
  loadingMore?: boolean;
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
const RAYCAST_WINDOW = 40; // only raycast tiles within ±40 of focus (rest off-screen)

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

export function PosterWall({ movies, onClose, initialSort, loadingMore }: PosterWallProps) {
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

  // Refs mirroring the latest React values so the WebGL closures (which never
  // re-run on prop changes) can always read the current movies + sort without
  // being re-created. The rebuild effect reads these on every append.
  const moviesRef = useRef(movies);
  moviesRef.current = movies;
  const sortKeyRef = useRef<SortKey>(sortKey);
  sortKeyRef.current = sortKey;
  const sortOrderRef = useRef<"asc" | "desc">(sortOrder);
  sortOrderRef.current = sortOrder;

  // Imperative bridge the WebGL effect installs so pill clicks + progressive
  // appends can reconcile the scene without tearing down the renderer.
  const rebuildRef = useRef<((key: SortKey, order: "asc" | "desc") => void) | null>(null);

  const isEmpty = movies.length === 0;

  useEffect(() => {
    const container = containerRef.current;
    if (isEmpty || !container) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new Scene();
    scene.background = new Color(0x06060a);

    // Big unlit gradient plane far behind everything for depth. Sized generously
    // so black never shows past its edges even at large camera distances; also
    // recentered/rescaled from refit() so it always covers the visible field.
    const bgTexture = makeBackgroundTexture();
    const bgGeo = new PlaneGeometry(200, 120);
    const bgMat = new MeshBasicMaterial({ map: bgTexture, depthWrite: false });
    const bgMesh = new Mesh(bgGeo, bgMat);
    bgMesh.position.set(0, 0, -8);
    scene.add(bgMesh);

    const camera = new PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      500,
    );

    // ---- Adaptive framing --------------------------------------------------
    // Reserve pixel bands top (sort pills) and bottom (HUD) so the focused
    // poster never collides with them; scale the camera distance so the focused
    // poster exactly fills the usable band, and offset it into that band's
    // center (straight-on — no downward tilt).
    const TOP_RESERVE_PX = 96; // sort pills
    const BOTTOM_RESERVE_PX = 150; // HUD + margin
    const FILL = 1.0; // focused poster exactly fills the usable band
    const fovRad = (45 * Math.PI) / 180;
    const refit = () => {
      const W = container.clientWidth;
      const H = container.clientHeight;
      camera.aspect = W / H;
      const usable = Math.max(300, H - TOP_RESERVE_PX - BOTTOM_RESERVE_PX);
      // Focused poster world height at plane z = FOCUS_Z.
      const hW = POSTER_H * FOCUS_SCALE * FILL;
      // Frustum height (world units) that must be visible at the focus plane so
      // the poster occupies exactly `usable` px of the `H` px viewport.
      const visH = (hW * H) / usable;
      const camZ = FOCUS_Z + visH / (2 * Math.tan(fovRad / 2));
      // Shift the poster into the usable band's center: that center sits
      // (TOP_RESERVE - BOTTOM_RESERVE)/2 px below the viewport center.
      const yW = (visH * (TOP_RESERVE_PX - BOTTOM_RESERVE_PX)) / (2 * H);
      camera.position.set(0, yW, camZ);
      camera.lookAt(0, yW, 0);
      camera.updateProjectionMatrix();
      // Keep the gradient backdrop covering the whole field behind the wall.
      bgMesh.position.set(0, yW, -8);
    };
    refit();

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
      isNew: boolean; // freshly created this reconcile pass (seed grow-in cur)
    }

    const tiles: Tile[] = [];
    const tileByMesh = new Map<Mesh, Tile>();
    const pickMeshes: Mesh[] = [];

    let sepCounter = 0;

    // Fully dispose a tile's GPU resources and detach it from the scene. Used
    // for tiles that disappear from the new flow and for separators (which are
    // cheap and always recreated) — NEVER for a reused movie tile.
    const disposeTile = (tile: Tile) => {
      scene.remove(tile.mesh);
      scene.remove(tile.reflMesh);
      tile.material.dispose();
      tile.reflMaterial.dispose();
      if (tile.texture) tile.texture.dispose();
      if (tile.sepTexture) tile.sepTexture.dispose();
    };

    // Create a brand-new tile (mesh + reflection + materials) for a flow item.
    // Movie tiles start with a placeholder; separators bake their canvas map.
    const createTile = (item: FlowItem): Tile => {
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

      const key = isSep ? `__sep_${sepCounter++}` : item.movie.id;
      return {
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
        isNew: true,
      };
    };

    // Reconcile the tile set against a new flow, reusing movie tiles by
    // movie.id so their mesh/material/texture/cur-transform survive untouched.
    // Returns nothing; mutates `tiles`/`tileByMesh`/`pickMeshes` in place.
    //   * Reused movie tile: keep everything, only refresh its `item` ref and
    //     mark it not-new (no texture reload, no pop).
    //   * Separator: dispose the old one and recreate (keys are synthetic).
    //   * Vanished tile (key absent from new flow): removed + fully disposed.
    //   * Brand-new movie tile: created fresh, flagged `isNew` so rebuild()
    //     seeds its `cur` from the grow-in pose.
    const buildTiles = (flow: FlowItem[]) => {
      const prevByKey = new Map<string, Tile>();
      for (const tile of tiles) prevByKey.set(tile.key, tile);

      const next: Tile[] = [];
      const reusedKeys = new Set<string>();

      for (const item of flow) {
        if (item.kind === "movie") {
          const existing = prevByKey.get(item.movie.id);
          if (existing) {
            existing.item = item; // refresh reference (metadata is stable)
            existing.isNew = false;
            reusedKeys.add(existing.key);
            next.push(existing);
            continue;
          }
        }
        // Separators (synthetic keys) and new movies are created fresh.
        next.push(createTile(item));
      }

      // Dispose every previous tile the new flow no longer references. Reused
      // movie tiles are in `reusedKeys`; separators are always recreated so
      // their old instances get disposed here.
      for (const tile of tiles) {
        if (!reusedKeys.has(tile.key)) disposeTile(tile);
      }

      // Ensure freshly-created tiles are in the scene (reused ones already are).
      tiles.length = 0;
      tileByMesh.clear();
      pickMeshes.length = 0;
      for (const tile of next) {
        if (tile.isNew) {
          scene.add(tile.mesh);
          scene.add(tile.reflMesh);
        }
        tiles.push(tile);
        tileByMesh.set(tile.mesh, tile);
        if (tile.item.kind !== "separator") pickMeshes.push(tile.mesh);
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
      // Distance-sorted list of tiles that currently hold textures. Iterate by
      // index so the distance calc is O(1) per tile (no tiles.indexOf → O(n²)).
      const resident: { tile: Tile; dist: number }[] = [];
      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        if (tile.texture) {
          const dist = Math.abs(i - focusI);
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

    // ---- Rebuild (initial build + sort reorder + progressive append) ----
    // Reconcile the tile set for the given sort against the CURRENT movies
    // (read from the ref, so appends flow in without re-running the effect).
    // Reused tiles keep their pose + texture; only brand-new tiles get their
    // `cur` seeded so they gently grow in. Remembers the focused movie so the
    // focus stays anchored across reorders and appends.
    const rebuild = (key: SortKey, order: "asc" | "desc") => {
      const prevTile = tiles[clampFocusInt(focusFloat)];
      const prevMovieId =
        prevTile && prevTile.item.kind === "movie" ? prevTile.item.movie.id : null;

      const flow = buildFlow(moviesRef.current, key, order);
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

      focusFloat = newFocus;
      targetFocus = newFocus;
      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        computeTarget(i, focusFloat, tile);
        // Seed `cur` ONLY for brand-new tiles (grow in gently from a slightly
        // smaller pose). Reused tiles keep their existing `cur` so appends /
        // reorders don't pop already-visible posters.
        if (tile.isNew) {
          const tg = tile.target;
          tile.cur = { ...tg, scale: reducedMotion ? tg.scale : tg.scale * 0.9 };
          tile.isNew = false;
        }
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
    rebuildRef.current = rebuild;

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
      // Only raycast the small band of tiles around the focus that can actually
      // be under the pointer; off-window tiles are off-screen and would make
      // the raycast O(n) over the whole (potentially huge) library.
      const center = clampFocusInt(focusFloat);
      const lo = Math.max(0, center - RAYCAST_WINDOW);
      const hi = Math.min(tiles.length - 1, center + RAYCAST_WINDOW);
      const candidates: Mesh[] = [];
      for (let i = lo; i <= hi; i++) candidates.push(tiles[i].mesh);
      const hits = raycaster.intersectObjects(candidates, false);
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
        // Do NOT call onClose here: leaving the wall mounted until the route
        // change unmounts the movies page prevents the grid from flashing.
        if (hoveredTile.item.kind === "movie") {
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
            // See onClick: keep the wall mounted so the grid never flashes.
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
      renderer.setSize(container.clientWidth, container.clientHeight);
      refit();
      // Repaint even when the animation loop is settled so a window resize
      // never leaves a stale small viewport. (renderOnce is a no-op mid-loop.)
      renderOnce();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // ---- Teardown -------------------------------------------------------
    return () => {
      disposed = true;
      loopRunning = false;
      rebuildRef.current = null;
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
    // Renderer/scene/closures are set up ONCE per (non-empty) mount and own
    // their own state via rebuildRef. This effect must NOT re-run when `movies`
    // grows (progressive appends) — that would tear down + rebuild the whole
    // renderer and re-download every texture. Progressive appends and sort
    // changes are handled by the separate [movies] effect + rebuildRef below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty]);

  // Run the first build on mount and reconcile the scene on every progressive
  // append (movies reference changes as pages arrive). rebuildRef reads the
  // latest sort from its refs so it stays in sync with the pills.
  useEffect(() => {
    if (!isEmpty) rebuildRef.current?.(sortKeyRef.current, sortOrderRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies]);

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
    rebuildRef.current?.(key, nextOrder);
  };

  // Portal to <body>: the wall is rendered inside the movie grid, whose
  // entrance animation leaves a `transform` on an ancestor — that turns
  // `position: fixed` into "fixed relative to the grid box", shrinking the
  // wall to the grid's rect instead of the viewport.
  return createPortal(
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

      {/* "Loading more" indicator — subtle glass chip beside the close button
          while the parent's progressive fetch is still pulling pages. */}
      {loadingMore && (
        <div className="glass-btn pointer-events-none absolute right-16 top-4 z-10 flex h-10 items-center gap-2 rounded-full px-3 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("loadingMore")}</span>
        </div>
      )}

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

      {/* Cinema caption (bottom, full-width gradient — no box) */}
      {!isEmpty && hud && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center pb-8 pt-24 text-center bg-gradient-to-t from-[#06060a] via-[#06060a]/55 to-transparent">
          <div
            key={hud.title + hud.kind}
            className="animate-caption-rise motion-reduce:animate-none flex flex-col items-center"
          >
            <div className="max-w-[70vw] truncate text-xl font-semibold tracking-wide text-white/95 [text-shadow:0_2px_16px_rgba(0,0,0,0.9)]">
              {hud.title}
            </div>
            {hud.kind === "separator" ? (
              <div className="mt-1 text-sm text-white/55">{hud.sublabel}</div>
            ) : hud.meta ? (
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[13px] text-white/65">
                {(() => {
                  const meta = hud.meta;
                  const items: ReactNode[] = [];
                  if (meta.year) items.push(<span key="year">{meta.year}</span>);
                  if (meta.resolution)
                    items.push(
                      <span
                        key="resolution"
                        className="rounded border border-white/20 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wider text-white/85"
                      >
                        {meta.resolution}
                      </span>,
                    );
                  if (meta.codec)
                    items.push(
                      <span key="codec" className="uppercase">
                        {meta.codec}
                      </span>,
                    );
                  if (meta.fileSize) items.push(<span key="fileSize">{meta.fileSize}</span>);
                  if (meta.runtime) items.push(<span key="runtime">{meta.runtime}</span>);
                  if (meta.communityRating != null && meta.communityRating > 0)
                    items.push(
                      <span key="communityRating" className="font-semibold text-purple-400">
                        ★ {meta.communityRating.toFixed(1)}
                      </span>,
                    );
                  if (meta.personalRating != null && meta.personalRating > 0)
                    items.push(
                      <span key="personalRating" className="font-semibold text-[var(--gold)]">
                        ★ {meta.personalRating.toFixed(1)}
                      </span>,
                    );
                  return items.flatMap((node, i) =>
                    i === 0
                      ? [node]
                      : [
                          <span key={`dot-${i}`} className="text-white/25">
                            ·
                          </span>,
                          node,
                        ],
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

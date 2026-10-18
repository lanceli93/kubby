"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolveImageSrc } from "@/lib/image-utils";
import { getRootScale } from "@/hooks/use-root-scale";
import { HAND_SIZE } from "@/lib/recommend/presets";
import type { PoolItem, RecommendCard } from "@/lib/recommend/types";
import { HandCardFace } from "./card-faces";
import {
  cardKey,
  type HandSlot,
  type RecommendSceneDef,
  type RecommendSceneProps,
} from "./scene-types";

/**
 * 星云漩涡 Vortex — the default recommend scene, ported from
 * data/demos/recommend/b-vortex.html.
 *
 * The candidate pool orbits as a 3D card nebula (5 depth layers, differential
 * rotation, pointer parallax) over a 2D canvas of spiral dust + stars. Filter
 * changes fade non-matching cards out / new ones in with a per-card stagger. A
 * draw spins the vortex up (motion streaks), then deals the hand out of the
 * swirl along curved paths into a front row; unlocked cards are sucked back on
 * re-draw, dismissed ones are thrown away.
 *
 * Everything per-frame lives in `VortexEngine` (refs + one rAF loop writing
 * transform/opacity). React renders only when the hand changes: hand-card
 * wrappers + shared faces are React elements, the engine positions them.
 */

// ── math helpers ──────────────────────────────────────────────────────────
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number) => t * t * t;
const easeOutBack = (t: number) => {
  const c = 1.25;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const bez = (a: number, b: number, c: number, t: number) => {
  const u = 1 - t;
  return u * u * a + 2 * u * t * b + t * t * c;
};
// differential rotation (inner = faster)
const omega = (r: number) => 0.055 * Math.pow(0.6 / Math.max(r, 0.05), 0.75);

// depth layers: radius band (×R), depth band (px), opacity; blur is a CSS class
const LAYERS = [
  { r: [0.07, 0.3], z: [-1500, -1050], op: 0.85 },
  { r: [0.26, 0.56], z: [-950, -560], op: 0.9 },
  { r: [0.48, 0.84], z: [-440, -150], op: 1 },
  { r: [0.76, 1.08], z: [-90, 110], op: 1 },
  { r: [0.58, 0.95], z: [300, 440], op: 0.55 },
] as const;

/** Real (one per pool item) cloud cards are capped; small pools are padded
 *  with blurred deep-core ghost copies so the nebula never looks sparse. */
const CLOUD_CAP = 64;
/** Gold actor cards are accents — keep them a minority of the pile. */
const ACTOR_CAP = 14;
const CLOUD_TARGET = 84;
const GHOST_MAX = 30;

const FLY_IN_MS = 1250;
const FLY_OUT_MS = 820;
const DISMISS_MS = 560;
const DEAL_STAGGER = 120;

// ── engine types ──────────────────────────────────────────────────────────
interface Orbit {
  r0: number;
  a: number;
  z0: number;
  rot: number;
  wf: number;
  ph: number;
  x: number;
  y: number;
  z: number;
  op: number;
}

interface CloudCard extends Orbit {
  key: string;
  el: HTMLDivElement;
  kind: "movie" | "person";
  L: number;
  ghost: boolean;
  baseOp: number;
  match: boolean;
  presence: number;
  changeAt: number;
  k: number;
  reveal: number;
  taken: boolean;
  lastOp: number;
}

type HandMode = "wait" | "in" | "rest" | "out" | "dismiss";

interface HandAnim {
  key: string;
  el: HTMLDivElement;
  inner: HTMLDivElement | null;
  flash: HTMLDivElement | null;
  kind: "movie" | "person";
  slot: number;
  mode: HandMode;
  t0: number;
  src: Orbit | null;
  /** cloud card hidden while this card is in the hand */
  taken: CloudCard | null;
  P0: { x: number; y: number };
  P1: { x: number; y: number };
  from: { x: number; y: number };
  s0: number;
  rz0: number;
  ry0: number;
  op0: number;
  dir: number;
  tilt: { x: number; y: number; tx: number; ty: number; lift: number; tl: number };
  ry: number;
  bob: number;
  cx: number;
  cy: number;
  started: boolean;
}

interface Shown {
  key: string;
  card: RecommendCard;
  slot: number;
  leaving: null | "back" | "dismiss";
}

// ── engine ────────────────────────────────────────────────────────────────
class VortexEngine {
  private V = { w: 0, h: 0, CX: 0, CY: 0, R: 0, P: 1000, cw: 90, flat: 0.72, dpr: 1, left: 0, top: 0 };
  private view = { rx: 0, ry: 0, tx: 0, ty: 0 };
  private M = { spin: 6, spinGoal: 1, streak: 0, skyAlpha: 0, skyGoal: 1, dustA: 0, dustA2: 0, core: 0, t: 0 };
  private pointer = { x: 0, y: 0, has: false };
  private cards: CloudCard[] = [];
  private hand = new Map<string, HandAnim>();
  private HL = { w: 200, h: 300 };
  private slotGeo: { x: number; y: number }[] = [];
  private insets = { top: 0, bottom: 0 };
  private stars: { r: number; a: number; s: number; b: number }[] = [];
  private dustTex: HTMLCanvasElement | null = null;
  private dustTex2: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null;
  private raf = 0;
  private last = 0;
  private running = false;
  private reduced = false;
  private seeded = false;
  private spinTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private root: HTMLDivElement,
    private stage: HTMLDivElement,
    private nebula: HTMLDivElement,
    private sky: HTMLCanvasElement,
    private dimmer: HTMLDivElement,
    private onDone: (key: string) => void
  ) {
    this.ctx = sky.getContext("2d");
    this.buildSky();
  }

  // ── lifecycle ──
  start() {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  destroy() {
    this.stop();
    if (this.spinTimer) clearTimeout(this.spinTimer);
    for (const c of this.cards) c.el.remove();
    this.cards = [];
    this.hand.clear();
  }

  setReduced(r: boolean) {
    this.reduced = r;
    if (r) {
      this.M.spin = 0;
      this.M.spinGoal = 0;
    } else if (this.M.spinGoal === 0) {
      this.M.spinGoal = this.hasHand() ? 0.22 : 1;
    }
  }
  setInsets(top: number, bottom: number) {
    if (top === this.insets.top && bottom === this.insets.bottom) return;
    this.insets = { top, bottom };
    this.layoutHand();
  }

  resize() {
    const V = this.V;
    const b = this.root.getBoundingClientRect();
    V.w = b.width;
    V.h = b.height;
    V.left = b.left;
    V.top = b.top;
    if (V.w <= 0 || V.h <= 0) return;
    V.dpr = Math.min(2, window.devicePixelRatio || 1);
    V.CX = V.w / 2;
    V.CY = V.h * 0.48;
    V.R = Math.min(V.w * 0.5, V.h * 0.82);
    V.P = Math.max(900, Math.min(1500, V.w * 0.8));
    V.cw = clamp(Math.min(V.w, V.h * 1.5) * 0.072, 58, 112);
    this.stage.style.perspective = `${V.P}px`;
    this.stage.style.perspectiveOrigin = `${V.CX}px ${V.CY}px`;
    this.nebula.style.top = `${V.CY}px`;
    this.sky.width = Math.round(V.w * V.dpr);
    this.sky.height = Math.round(V.h * V.dpr);
    this.sky.style.width = `${V.w}px`;
    this.sky.style.height = `${V.h}px`;
    for (const c of this.cards) this.sizeCloudCard(c);
    this.layoutHand();
  }

  // ── pointer ──
  pointerMove(clientX: number, clientY: number) {
    const V = this.V;
    if (!V.w) return;
    this.pointer.x = ((clientX - V.left) / V.w) * 2 - 1;
    this.pointer.y = ((clientY - V.top) / V.h) * 2 - 1;
    this.pointer.has = true;
  }
  pointerLeave() {
    this.pointer.has = false;
  }
  /** Pointer over a hand card. Uses the engine's own geometry (no
   *  getBoundingClientRect → no forced reflow per pointermove). */
  tilt(key: string, clientX: number, clientY: number) {
    const e = this.hand.get(key);
    if (!e) return;
    const { w, h } = this.HL;
    const px = clamp((clientX - this.V.left - (e.cx - w / 2)) / w, 0, 1);
    const py = clamp((clientY - this.V.top - (e.cy - h / 2)) / h, 0, 1);
    e.tilt.ty = (px - 0.5) * 22;
    e.tilt.tx = -(py - 0.5) * 18;
    e.tilt.tl = 1;
    const gx = `${(px * 100).toFixed(1)}%`;
    const gy = `${(py * 100).toFixed(1)}%`;
    e.el.style.setProperty("--gx", gx);
    e.el.style.setProperty("--gy", gy);
    e.el.style.setProperty("--hx", gx);
    e.el.style.setProperty("--hy", gy);
  }
  untilt(key: string) {
    const e = this.hand.get(key);
    if (!e) return;
    e.tilt.tx = 0;
    e.tilt.ty = 0;
    e.tilt.tl = 0;
  }
  isResting(key: string) {
    return this.hand.get(key)?.mode === "rest";
  }

  // ── choreography cues ──
  spinUp(delay: number) {
    if (this.spinTimer) clearTimeout(this.spinTimer);
    this.dimmer.dataset.on = "false";
    this.M.skyGoal = 1;
    if (this.reduced) return;
    this.spinTimer = setTimeout(() => {
      this.spinTimer = null;
      this.M.spinGoal = 17;
    }, delay);
  }
  /** Draw resolved without new cards (error / empty) — settle the vortex. */
  settle() {
    if (this.spinTimer) {
      clearTimeout(this.spinTimer);
      this.spinTimer = null;
    }
    const has = this.hasHand();
    if (!this.reduced) this.M.spinGoal = has ? 0.22 : 1;
    this.M.skyGoal = has ? 0.5 : 1;
    this.dimmer.dataset.on = String(has);
  }
  private hasHand() {
    for (const e of this.hand.values()) if (e.mode !== "out" && e.mode !== "dismiss") return true;
    return false;
  }

  // ── cloud ──
  private makeCloudCard(item: PoolItem, L: number, ghost: boolean, now: number, delay: number): CloudCard {
    const el = document.createElement("div");
    el.className = `rc-nc L${L}${item.type === "person" ? " actor" : ""}`;
    if (item.blur) {
      el.style.backgroundImage = `url(${item.blur})`;
      el.style.backgroundSize = "cover";
    }
    if (item.image) {
      const img = document.createElement("img");
      img.decoding = "async";
      img.fetchPriority = "low"; // hand + ambient backdrop images load first
      img.draggable = false;
      img.alt = "";
      img.src = resolveImageSrc(item.image, 200);
      el.appendChild(img);
    }
    if (item.type === "person") {
      const glow = document.createElement("i");
      glow.className = "rc-nc-glow";
      el.appendChild(glow);
    }
    this.nebula.appendChild(el);
    const Ls = LAYERS[L];
    const r0 = rand(Ls.r[0], Ls.r[1]);
    const arm = (Math.random() < 0.5 ? 0 : Math.PI) + (L === 4 ? rand(0, Math.PI) : 0);
    const c: CloudCard = {
      key: cardKey(item),
      el,
      kind: item.type,
      L,
      ghost,
      r0,
      a: arm + r0 * 2.6 + rand(-0.5, 0.5),
      z0: rand(Ls.z[0], Ls.z[1]),
      baseOp: Ls.op,
      rot: rand(-14, 14),
      wf: rand(0.25, 0.6),
      ph: rand(0, Math.PI * 2),
      match: true,
      presence: 0,
      changeAt: now + delay,
      k: rand(2.2, 3.6),
      reveal: 1,
      taken: false,
      lastOp: -1,
      x: 0,
      y: 0,
      z: 0,
      op: 0,
    };
    this.sizeCloudCard(c);
    this.cards.push(c);
    return c;
  }
  private sizeCloudCard(c: CloudCard) {
    const cw = this.V.cw;
    const w = c.kind === "person" ? cw * 0.9 : cw;
    const h = w * 1.5;
    c.el.style.width = `${w}px`;
    c.el.style.height = `${h}px`;
    c.el.style.marginLeft = `${-w / 2}px`;
    c.el.style.marginTop = `${-h / 2}px`;
  }

  /** Diff the pile against a new pool sample: leavers fade out first and
   *  quickly, newcomers are pulled in a beat later. */
  syncPool(pool: PoolItem[]) {
    const now = performance.now();
    const first = !this.seeded && pool.length > 0;
    const byKey = new Map(pool.map((p) => [cardKey(p), p]));
    const realKeys = new Set<string>();
    let realCount = 0;
    let actorCount = 0;
    for (const c of this.cards) {
      const m = byKey.has(c.key);
      if (!c.ghost && m) {
        realKeys.add(c.key);
        realCount++;
        if (c.kind === "person") actorCount++;
      }
      if (m !== c.match) {
        c.match = m;
        c.changeAt = now + (m ? 120 + rand(0, 420) : rand(0, 260));
      }
    }
    // newcomers (real cards, one per pool item, capped)
    const fresh = pool.filter((p) => !realKeys.has(cardKey(p)));
    for (const p of fresh) {
      if (realCount >= CLOUD_CAP) break;
      if (p.type === "person" && actorCount >= ACTOR_CAP) continue;
      if (p.type === "person") actorCount++;
      let L: number;
      if (p.type === "person") L = Math.random() < 0.5 ? 2 : 3;
      else {
        const r = Math.random();
        L = r < 0.06 ? 4 : r < 0.3 ? 1 : r < 0.64 ? 2 : 3;
      }
      const c = this.makeCloudCard(p, L, false, now, 0);
      c.changeAt = first ? now + 200 + (1 - c.r0) * 900 + rand(0, 700) : now + 120 + rand(0, 420);
      realCount++;
    }
    // ghosts pad small pools with deep, blurred density
    const liveGhosts = this.cards.filter((c) => c.ghost && c.match);
    const want = pool.length ? clamp(CLOUD_TARGET - realCount, 0, GHOST_MAX) : 0;
    if (liveGhosts.length > want) {
      for (const g of liveGhosts.slice(want)) {
        g.match = false;
        g.changeAt = now + rand(0, 260);
      }
    } else if (pool.length) {
      const movies = pool.filter((p) => p.type === "movie");
      const src = movies.length ? movies : pool;
      for (let i = liveGhosts.length; i < want; i++) {
        const p = src[(Math.random() * src.length) | 0];
        const c = this.makeCloudCard(p, i < want * 0.66 ? 0 : 1, true, now, 0);
        c.changeAt = first ? now + 200 + (1 - c.r0) * 900 + rand(0, 700) : now + 200 + rand(0, 500);
      }
    }
    if (first) {
      this.seeded = true;
      if (!this.reduced) this.M.spin = 6;
    } else if (!this.reduced && this.M.spinGoal < 2) {
      // a small swirl kick: the pile reacts to the filter change
      this.M.spin = Math.max(this.M.spin, this.hasHand() ? 1.2 : 2.6);
    }
  }

  private orbit(c: Orbit, presence: number) {
    const { R, flat } = this.V;
    const s = this.M.streak;
    const tight = 1 - 0.13 * s;
    const out = this.reduced ? 0 : 1 - presence;
    const t = this.M.t;
    const r = c.r0 * R * (1 + 0.05 * Math.sin(t * c.wf + c.ph)) * tight * (1 + out * out * 0.25 + out * 0.95);
    c.x = Math.cos(c.a) * r;
    c.y = Math.sin(c.a) * r * flat;
    c.z = c.z0 - out * 520 + Math.sin(t * 0.3 * c.wf + c.ph) * 34 - s * 160;
  }

  private updateCloud(dt: number, now: number) {
    const R = this.V.R;
    const s = this.M.streak;
    const t = this.M.t;
    let gc = false;
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      if (now >= c.changeAt) {
        const tgt = c.match ? 1 : 0;
        c.presence += (tgt - c.presence) * (1 - Math.exp(-dt * c.k));
        if (Math.abs(tgt - c.presence) < 0.001) c.presence = tgt;
        if (!c.match && c.presence === 0 && !c.taken) gc = true;
      }
      const rv = c.taken ? 0 : 1;
      c.reveal += (rv - c.reveal) * (1 - Math.exp(-dt * (c.taken ? 40 : 7)));
      c.a += omega(c.r0) * this.M.spin * dt;
      this.orbit(c, c.presence);
      const p = c.presence;
      const pres = p * p * (3 - 2 * p);
      const op = c.baseOp * pres * c.reveal;
      c.op = op;
      if (op <= 0.002 && c.lastOp <= 0.002) {
        if (c.lastOp !== 0) {
          c.el.style.opacity = "0";
          c.lastOp = 0;
        }
        continue;
      }
      const ryc = -(c.x / R) * 16;
      const rxc = (c.y / R) * 12;
      const rz = c.rot + Math.sin(t * c.wf * 0.7 + c.ph) * 4 + s * 10;
      c.el.style.transform = `translate3d(${c.x.toFixed(1)}px,${c.y.toFixed(1)}px,${c.z.toFixed(1)}px) rotateY(${ryc.toFixed(2)}deg) rotateX(${rxc.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`;
      if (Math.abs(op - c.lastOp) > 0.004) {
        c.el.style.opacity = op.toFixed(3);
        c.lastOp = op;
      }
    }
    if (gc) {
      this.cards = this.cards.filter((c) => {
        const dead = !c.match && c.presence === 0 && !c.taken && now >= c.changeAt;
        if (dead) c.el.remove();
        return !dead;
      });
    }
  }

  // local nebula point → scene px (matches CSS perspective + rotateX/rotateY)
  private project(x: number, y: number, z: number) {
    const { view, V } = this;
    const cy = Math.cos(view.ry);
    const sy = Math.sin(view.ry);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const cx = Math.cos(view.rx);
    const sx = Math.sin(view.rx);
    const y2 = y * cx - z1 * sx;
    const z2 = y * sx + z1 * cx;
    const s = V.P / Math.max(80, V.P - z2);
    return { x: V.CX + x1 * s, y: V.CY + y2 * s, s };
  }
  private tangentAt(c: Orbit) {
    const r = Math.hypot(c.x, c.y / this.V.flat);
    const p0 = this.project(c.x, c.y, c.z);
    const p1 = this.project(Math.cos(c.a + 0.05) * r, Math.sin(c.a + 0.05) * r * this.V.flat, c.z);
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }
  /** A virtual orbit point for cards that aren't in the visible pile sample. */
  private phantom(): Orbit {
    const L = LAYERS[Math.random() < 0.5 ? 2 : 3];
    const o: Orbit = {
      r0: rand(L.r[0], L.r[1]),
      a: rand(0, Math.PI * 2),
      z0: rand(L.z[0], L.z[1]),
      rot: rand(-14, 14),
      wf: rand(0.25, 0.6),
      ph: rand(0, Math.PI * 2),
      x: 0,
      y: 0,
      z: 0,
      op: 0.4,
    };
    this.orbit(o, 1);
    return o;
  }
  private sourceFor(key: string): { src: Orbit; card: CloudCard | null } {
    const c = this.cards.find((k) => k.key === key && !k.ghost && k.match && k.op > 0.05);
    return c ? { src: c, card: c } : { src: this.phantom(), card: null };
  }

  // ── sky ──
  private makeDust(seedHue: number, n: number, warm: boolean) {
    const S = 1024;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    if (!g) return c;
    g.globalCompositeOperation = "lighter";
    const pal = [
      [99, 102, 241],
      [129, 140, 248],
      [124, 58, 237],
      [56, 72, 190],
      [168, 85, 247],
    ];
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const r = Math.pow(t, 0.8) * S * 0.48;
      const arm = (i % 2) * Math.PI + seedHue;
      const a = arm + (r / (S * 0.5)) * 3.1 + rand(-0.55, 0.55);
      const x = S / 2 + Math.cos(a) * r;
      const y = S / 2 + Math.sin(a) * r;
      const rad = rand(24, 120) * (1 - t * 0.5);
      let col = pal[(Math.random() * pal.length) | 0];
      if (warm && t < 0.28 && Math.random() < 0.4) col = [202, 138, 4];
      const al = rand(0.025, 0.07) * (1 - t * 0.6);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${col},${al})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // dark dust lanes for contrast
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 70; i++) {
      const t = rand(0.15, 1);
      const r = t * S * 0.46;
      const a = (i % 2) * Math.PI + seedHue + 0.9 + t * 3.1 + rand(-0.3, 0.3);
      const x = S / 2 + Math.cos(a) * r;
      const y = S / 2 + Math.sin(a) * r;
      const rad = rand(20, 70);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(0,0,0,.35)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    return c;
  }
  private buildSky() {
    this.dustTex = this.makeDust(0, 520, true);
    this.dustTex2 = this.makeDust(1.3, 260, false);
    for (let i = 0; i < 520; i++) {
      const t = Math.random();
      this.stars.push({
        r: 0.04 + Math.pow(t, 0.7) * 1.55,
        a: rand(0, Math.PI * 2),
        s: Math.random() < 0.08 ? 1.6 : rand(0.5, 1.1),
        b: (Math.random() * 3) | 0,
      });
    }
  }
  private drawSky(dt: number) {
    const ctx = this.ctx;
    const { V, M, view } = this;
    if (!ctx || !this.dustTex || !this.dustTex2) return;
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    ctx.clearRect(0, 0, V.w, V.h);
    const A = M.skyAlpha;
    if (A < 0.01) return;
    const CX = V.CX + view.ry * -260;
    const CY = V.CY + view.rx * 200;
    const R = V.R;
    M.dustA += dt * 0.01 * M.spin;
    M.dustA2 += dt * 0.017 * M.spin;
    ctx.globalCompositeOperation = "lighter";
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(1, V.flat);
    ctx.rotate(M.dustA);
    ctx.globalAlpha = A * 0.95;
    const d1 = R * 2.9;
    ctx.drawImage(this.dustTex, -d1 / 2, -d1 / 2, d1, d1);
    ctx.rotate(M.dustA2 - M.dustA);
    ctx.globalAlpha = A * (0.55 + M.streak * 0.4);
    const d2 = R * 1.7;
    ctx.drawImage(this.dustTex2, -d2 / 2, -d2 / 2, d2, d2);
    ctx.restore();
    // core glow
    const cr = R * (0.42 + M.core * 0.12);
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, cr);
    g.addColorStop(0, `rgba(235,232,255,${(0.16 + M.core * 0.22) * A})`);
    g.addColorStop(0.18, `rgba(129,140,248,${(0.12 + M.core * 0.16) * A})`);
    g.addColorStop(0.55, `rgba(99,102,241,${0.04 * A})`);
    g.addColorStop(1, "rgba(99,102,241,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(1, V.flat);
    ctx.translate(-CX, -CY);
    ctx.fillRect(CX - cr, CY - cr, cr * 2, cr * 2);
    ctx.restore();
    // stars (streak into arcs while spinning fast)
    const s = M.streak;
    const cols = ["rgba(200,205,255,", "rgba(255,255,255,", "rgba(255,226,170,"];
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(1, V.flat);
    for (let b = 0; b < 3; b++) {
      ctx.beginPath();
      for (let i = 0; i < this.stars.length; i++) {
        const st = this.stars[i];
        if (st.b !== b) continue;
        const w = omega(st.r) * 0.8;
        st.a += w * M.spin * dt;
        const rr = st.r * R;
        if (s > 0.04) {
          const len = Math.min(1.6, w * M.spin * 0.16);
          ctx.moveTo(Math.cos(st.a) * rr, Math.sin(st.a) * rr);
          ctx.arc(0, 0, rr, st.a, st.a - len, true);
        } else {
          ctx.rect(Math.cos(st.a) * rr, Math.sin(st.a) * rr, st.s, st.s / V.flat);
        }
      }
      const al = (b === 1 ? 0.75 : b === 2 ? 0.55 : 0.5) * A * (0.75 + 0.25 * Math.sin(M.t * (b + 1) * 0.7));
      if (s > 0.04) {
        ctx.strokeStyle = `${cols[b]}${al * (0.45 + s * 0.4)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = `${cols[b]}${al})`;
        ctx.fill();
      }
    }
    ctx.restore();
    // motion streaks behind every visible cloud card
    if (s > 0.02) {
      ctx.lineCap = "round";
      for (let i = 0; i < this.cards.length; i++) {
        const c = this.cards[i];
        if (c.op < 0.05 || c.L === 4) continue;
        const r = Math.hypot(c.x, c.y / V.flat);
        const sweep = Math.min(2.2, omega(c.r0) * M.spin * 0.3);
        const head = this.project(c.x, c.y, c.z);
        ctx.beginPath();
        ctx.moveTo(head.x, head.y);
        for (let k = 1; k <= 6; k++) {
          const a = c.a - (sweep * k) / 6;
          const q = this.project(Math.cos(a) * r, Math.sin(a) * r * V.flat, c.z);
          ctx.lineTo(q.x, q.y);
        }
        ctx.lineWidth = V.cw * head.s * 0.55;
        ctx.strokeStyle =
          c.kind === "person" ? `rgba(250,204,21,${0.07 * s * c.op})` : `rgba(129,140,248,${0.085 * s * c.op})`;
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // ── hand ──
  private layoutHand() {
    const { V } = this;
    if (!V.w) return;
    const scale = getRootScale();
    const top = this.insets.top + 12;
    const bottom = V.h - this.insets.bottom - 12;
    const avail = Math.max(120, bottom - top);
    const narrow = V.w < 640;
    const gapR = 0.12;
    let w: number;
    let h: number;
    this.slotGeo = [];
    if (!narrow) {
      h = Math.min(350 * scale, avail * 0.62);
      w = h / 1.5;
      w = Math.min(w, (V.w - 64) / (HAND_SIZE + (HAND_SIZE - 1) * gapR));
      h = w * 1.5;
      const cy = (top + bottom) / 2 + h * 0.07;
      for (let i = 0; i < HAND_SIZE; i++)
        this.slotGeo.push({ x: V.w / 2 + (i - (HAND_SIZE - 1) / 2) * w * (1 + gapR), y: cy });
    } else {
      // phones: 3 + 2 rows
      const cols = 3;
      w = (V.w - 28) / (cols + (cols - 1) * gapR);
      h = w * 1.5;
      const maxH = (avail * 0.94) / (2 + gapR);
      if (h > maxH) {
        h = maxH;
        w = h / 1.5;
      }
      const rowGap = h * gapR;
      const cy0 = (top + bottom) / 2 - (h + rowGap) / 2;
      for (let i = 0; i < HAND_SIZE; i++) {
        const row = i < cols ? 0 : 1;
        const inRow = row === 0 ? Math.min(cols, HAND_SIZE) : HAND_SIZE - cols;
        const col = row === 0 ? i : i - cols;
        this.slotGeo.push({
          x: V.w / 2 + (col - (inRow - 1) / 2) * w * (1 + gapR),
          y: cy0 + row * (h + rowGap),
        });
      }
    }
    this.HL = { w, h };
    for (const e of this.hand.values()) this.sizeHandCard(e);
  }
  private sizeHandCard(e: HandAnim) {
    const { w, h } = this.HL;
    e.el.style.width = `${w}px`;
    e.el.style.height = `${h}px`;
    e.el.style.setProperty("--cw", `${w}px`);
  }
  get cardWidth() {
    return this.HL.w;
  }

  /** Reconcile engine state with the React-rendered hand entries. */
  syncEntries(shown: Shown[], els: Map<string, HTMLDivElement>) {
    const now = performance.now();
    const live = new Set(shown.map((s) => s.key));
    for (const key of [...this.hand.keys()]) if (!live.has(key)) this.hand.delete(key);
    const fresh: HandAnim[] = [];
    for (const s of shown) {
      const el = els.get(s.key);
      if (!el) continue;
      let e = this.hand.get(s.key);
      if (!e) {
        if (s.leaving) {
          // never dealt by this engine — nothing to animate, just drop it
          queueMicrotask(() => this.onDone(s.key));
          continue;
        }
        e = {
          key: s.key,
          el,
          inner: el.querySelector<HTMLDivElement>(".rc-hin"),
          flash: el.querySelector<HTMLDivElement>(".rc-flash"),
          kind: s.card.type,
          slot: s.slot,
          mode: "wait",
          t0: 0,
          src: null,
          taken: null,
          P0: { x: 0, y: 0 },
          P1: { x: 0, y: 0 },
          from: { x: 0, y: 0 },
          s0: 1,
          rz0: 0,
          ry0: 0,
          op0: 0,
          dir: 1,
          tilt: { x: 0, y: 0, tx: 0, ty: 0, lift: 0, tl: 0 },
          ry: 0,
          bob: rand(0, 6.3),
          cx: 0,
          cy: 0,
          started: false,
        };
        el.style.opacity = "0";
        el.dataset.flying = "true";
        this.hand.set(s.key, e);
        this.sizeHandCard(e);
        fresh.push(e);
        continue;
      }
      e.el = el;
      if (s.leaving && e.mode !== "out" && e.mode !== "dismiss") {
        this.startLeave(e, s.leaving, now);
      } else if (!s.leaving && (e.mode === "out" || e.mode === "dismiss")) {
        // came back while leaving (repeat draw) — deal it in again
        e.slot = s.slot;
        e.mode = "wait";
        e.started = false;
        fresh.push(e);
      } else if (!s.leaving && e.slot !== s.slot) {
        e.slot = s.slot;
        this.sizeHandCard(e);
      }
    }
    // stagger leavers left → right, then deal newcomers left → right
    let outI = 0;
    for (const e of [...this.hand.values()].sort((a, b) => a.slot - b.slot)) {
      if ((e.mode === "out" || e.mode === "dismiss") && !e.started && e.t0 === -1) {
        e.t0 = now + outI++ * 70;
      }
    }
    if (fresh.length) {
      fresh.sort((a, b) => a.slot - b.slot);
      fresh.forEach((e, i) => {
        e.mode = "in";
        e.t0 = now + i * DEAL_STAGGER;
        e.started = false;
      });
      if (!this.reduced) this.M.spinGoal = 0.22;
      this.M.skyGoal = 0.5;
      this.dimmer.dataset.on = "true";
    } else if (!this.hasHand() && !this.spinTimer && this.M.spinGoal < 2) {
      if (!this.reduced) this.M.spinGoal = 1;
      this.M.skyGoal = 1;
      this.dimmer.dataset.on = "false";
    }
  }

  private startLeave(e: HandAnim, how: "back" | "dismiss", now: number) {
    e.mode = how === "back" ? "out" : "dismiss";
    e.started = false;
    e.t0 = how === "back" ? -1 : now; // -1 → staggered in syncEntries
    e.from = { x: e.cx, y: e.cy };
    e.el.dataset.flying = "true";
    if (how === "back") {
      const { src, card } = e.taken ? { src: e.taken as Orbit, card: e.taken } : this.sourceFor(e.key);
      e.src = src;
      e.taken = card;
    } else {
      e.dir = e.cx < this.V.w / 2 ? -1 : 1;
    }
  }

  private startFlyIn(e: HandAnim) {
    const { src, card } = this.sourceFor(e.key);
    const p = this.project(src.x, src.y, src.z);
    const tg = this.tangentAt(src);
    const dst = this.slotGeo[e.slot] ?? { x: this.V.w / 2, y: this.V.h / 2 };
    const dist = Math.hypot(dst.x - p.x, dst.y - p.y);
    e.src = src;
    e.P0 = { x: p.x, y: p.y };
    e.P1 = { x: p.x + tg.x * dist * 0.55, y: p.y + tg.y * dist * 0.55 };
    e.s0 = clamp((this.V.cw * p.s) / this.HL.w, 0.12, 1.4);
    e.rz0 = src.rot + 10 * this.M.streak;
    e.ry0 = (tg.x > 0 ? -1 : 1) * 55;
    e.op0 = Math.max(0.25, src.op);
    e.started = true;
    if (card) {
      card.taken = true;
      e.taken = card;
    }
  }

  private setHandTransform(e: HandAnim, x: number, y: number, s: number, rz: number) {
    e.cx = x;
    e.cy = y;
    const { w, h } = this.HL;
    e.el.style.transform = `translate3d(${(x - w / 2).toFixed(1)}px,${(y - h / 2).toFixed(1)}px,0) rotate(${rz.toFixed(2)}deg) scale(${s.toFixed(4)})`;
  }

  private updateHand(dt: number, now: number) {
    const done: string[] = [];
    for (const e of this.hand.values()) {
      if (e.mode === "wait" || e.t0 < 0 || now < e.t0) continue;
      const dst = this.slotGeo[e.slot] ?? { x: this.V.w / 2, y: this.V.h / 2 };
      if (e.mode === "in") {
        if (this.reduced) {
          if (!e.started) {
            e.started = true;
            this.setHandTransform(e, dst.x, dst.y, 1, 0);
          }
          const t = clamp((now - e.t0) / 320, 0, 1);
          e.el.style.opacity = t.toFixed(3);
          if (t >= 1) this.toRest(e);
          continue;
        }
        if (!e.started) this.startFlyIn(e);
        const t = clamp((now - e.t0) / FLY_IN_MS, 0, 1);
        const k = easeOutQuart(t);
        const x = bez(e.P0.x, e.P1.x, dst.x, k);
        const y = bez(e.P0.y, e.P1.y, dst.y, k);
        const s = lerp(e.s0, 1, easeOutBack(Math.min(1, t * 1.08)));
        this.setHandTransform(e, x, y, s, lerp(e.rz0, 0, easeOutCubic(t)));
        e.ry = lerp(e.ry0, 0, easeOutCubic(t));
        e.el.style.opacity = Math.min(1, e.op0 + t * 6).toFixed(3);
        if (t >= 1) {
          this.toRest(e);
          e.flash?.animate([{ opacity: 0.9 }, { opacity: 0 }], {
            duration: 900,
            easing: "cubic-bezier(.16,1,.3,1)",
          });
        }
      } else if (e.mode === "out") {
        e.started = true;
        if (this.reduced) {
          const t = clamp((now - e.t0) / 260, 0, 1);
          e.el.style.opacity = (1 - t).toFixed(3);
          if (t >= 1) {
            if (e.taken) e.taken.taken = false;
            done.push(e.key);
          }
          continue;
        }
        const c = e.src ?? (e.src = this.phantom());
        if (!e.taken) {
          // phantom targets orbit with the vortex too
          c.a += omega(c.r0) * this.M.spin * dt;
          this.orbit(c, 1);
        }
        const t = clamp((now - e.t0) / FLY_OUT_MS, 0, 1);
        const k = easeInCubic(t);
        const p = this.project(c.x, c.y, c.z);
        const tg = this.tangentAt(c);
        const dist = Math.hypot(p.x - e.from.x, p.y - e.from.y);
        const P1x = p.x - tg.x * dist * 0.6;
        const P1y = p.y - tg.y * dist * 0.6;
        const s1 = clamp((this.V.cw * p.s) / this.HL.w, 0.08, 1.4);
        this.setHandTransform(e, bez(e.from.x, P1x, p.x, k), bez(e.from.y, P1y, p.y, k), lerp(1, s1, k), lerp(0, c.rot, k) + k * 40);
        e.ry = lerp(0, 50, k);
        if (t > 0.62 && e.taken) e.taken.taken = false;
        e.el.style.opacity = (1 - clamp((t - 0.6) / 0.4, 0, 1)).toFixed(3);
        if (t >= 1) done.push(e.key);
      } else if (e.mode === "dismiss") {
        e.started = true;
        const t = clamp((now - e.t0) / (this.reduced ? 260 : DISMISS_MS), 0, 1);
        if (this.reduced) {
          e.el.style.opacity = (1 - t).toFixed(3);
        } else {
          // thrown away: up and out, spinning off
          const k = easeInCubic(t);
          const x = e.from.x + e.dir * k * this.HL.w * 1.6;
          const y = e.from.y - easeOutCubic(t) * this.HL.h * 0.35 + k * this.HL.h * 0.9;
          this.setHandTransform(e, x, y, lerp(1, 0.78, k), e.dir * k * 38);
          e.ry = e.dir * k * 30;
          e.el.style.opacity = (1 - clamp((t - 0.35) / 0.65, 0, 1)).toFixed(3);
        }
        if (t >= 1) {
          if (e.taken) e.taken.taken = false;
          done.push(e.key);
        }
      }
    }
    // resting cards: tilt + bob (exponential smoothing, never direct writes)
    const f = 1 - Math.exp(-dt * 10);
    const fp = 1 - Math.exp(-dt * 8);
    for (const e of this.hand.values()) {
      const T = e.tilt;
      T.x += (T.tx - T.x) * f;
      T.y += (T.ty - T.y) * f;
      T.lift += (T.tl - T.lift) * f;
      if (e.mode === "rest") {
        const g = this.slotGeo[e.slot];
        if (g) {
          const bob = this.reduced ? 0 : Math.sin(this.M.t * 0.9 + e.bob) * 3 * (1 - T.lift);
          const tx = g.x;
          const ty = g.y + bob - T.lift * 10;
          // slot moves (resize / re-slot) glide instead of jumping
          this.setHandTransform(e, e.cx + (tx - e.cx) * fp, e.cy + (ty - e.cy) * fp, 1, 0);
        }
      }
      if (e.inner) {
        const tilt = this.reduced ? 0 : 1;
        e.inner.style.transform = `perspective(900px) rotateX(${(T.x * tilt).toFixed(2)}deg) rotateY(${(T.y * tilt + e.ry).toFixed(2)}deg) translateZ(${(T.lift * 24 * tilt).toFixed(1)}px)`;
      }
    }
    for (const key of done) {
      this.hand.delete(key);
      this.onDone(key);
    }
  }
  private toRest(e: HandAnim) {
    e.mode = "rest";
    e.ry = 0;
    e.el.style.opacity = "1";
    e.el.dataset.flying = "false";
    const g = this.slotGeo[e.slot];
    if (g) this.setHandTransform(e, g.x, g.y, 1, 0);
  }

  // ── main loop ──
  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const M = this.M;
    // reduced motion: freeze the scene clock (no wobble / bob / twinkle) —
    // only presence fades and the hand's opacity ramps still use dt
    if (!this.reduced) M.t += dt;
    if (this.reduced) {
      M.spin = 0;
    } else {
      const up = M.spinGoal > M.spin;
      M.spin += (M.spinGoal - M.spin) * (1 - Math.exp(-dt * (up ? 2.1 : 1.5)));
    }
    M.streak = clamp((M.spin - 2) / 11, 0, 1);
    M.core += (M.streak - M.core) * (1 - Math.exp(-dt * 3));
    M.skyAlpha += (M.skyGoal - M.skyAlpha) * (1 - Math.exp(-dt * 1.6));
    // pointer parallax tilts the whole nebula (smoothed, plus a slow idle sway)
    const view = this.view;
    const motion = this.reduced ? 0 : 1;
    const sway = Math.sin(M.t * 0.13) * 0.02 * motion;
    view.tx = this.pointer.has ? -this.pointer.y * 0.085 * motion : 0;
    view.ty = (this.pointer.has ? this.pointer.x * 0.12 * motion : 0) + sway;
    const f = 1 - Math.exp(-dt * 2.4);
    view.rx += (view.tx - view.rx) * f;
    view.ry += (view.ty - view.ry) * f;
    this.nebula.style.transform = `rotateX(${view.rx.toFixed(4)}rad) rotateY(${view.ry.toFixed(4)}rad)`;
    this.updateCloud(dt, now);
    this.drawSky(dt);
    this.updateHand(dt, now);
    this.raf = requestAnimationFrame(this.frame);
  };
}

// ── React side ────────────────────────────────────────────────────────────

/** Diff the previous rendered entries against the new hand. Cards no longer in
 *  the hand stay rendered (leaving) until the engine finishes animating them. */
function diffShown(prev: Shown[], hand: HandSlot[], dismissing: ReadonlySet<string>): Shown[] {
  const slotOf = new Map<string, number>();
  hand.forEach((c, i) => {
    if (c) slotOf.set(cardKey(c), i);
  });
  const next: Shown[] = [];
  const seen = new Set<string>();
  for (const s of prev) {
    const slot = slotOf.get(s.key);
    if (slot != null) {
      next.push({ ...s, card: hand[slot]!, slot, leaving: null });
      seen.add(s.key);
    } else {
      next.push(s.leaving ? s : { ...s, leaving: dismissing.has(s.key) ? "dismiss" : "back" });
    }
  }
  hand.forEach((c, i) => {
    if (!c) return;
    const key = cardKey(c);
    if (!seen.has(key)) next.push({ key, card: c, slot: i, leaving: null });
  });
  return next;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export function VortexScene({
  pool,
  hand,
  phase,
  drawToken,
  lockedKeys,
  staleKeys,
  reducedMotion,
  insets,
  onOpenMovie,
  onPlay,
  onToggleLock,
  onDismiss,
  onOpenPerson,
  onHover,
}: RecommendSceneProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const nebulaRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLCanvasElement>(null);
  const dimmerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VortexEngine | null>(null);
  const elsRef = useRef(new Map<string, HTMLDivElement>());

  const [dismissing, setDismissing] = useState<ReadonlySet<string>>(EMPTY_SET);
  const [prevHand, setPrevHand] = useState<HandSlot[] | null>(null);
  const [shown, setShown] = useState<Shown[]>([]);
  const [cardW, setCardW] = useState(200);
  if (hand !== prevHand) {
    setPrevHand(hand);
    setShown(diffShown(shown, hand, dismissing));
  }

  const handleDone = useCallback((key: string) => {
    setShown((s) => s.filter((e) => !(e.key === key && e.leaving)));
    setDismissing((d) => {
      if (!d.has(key)) return d;
      const n = new Set(d);
      n.delete(key);
      return n;
    });
  }, []);

  // engine lifecycle — a LAYOUT effect declared before the sync effects below,
  // so the engine exists when the first `syncEntries` runs (a restored hand is
  // present on the very first render).
  useLayoutEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const nebula = nebulaRef.current;
    const sky = skyRef.current;
    const dimmer = dimmerRef.current;
    if (!root || !stage || !nebula || !sky || !dimmer) return;
    const engine = new VortexEngine(root, stage, nebula, sky, dimmer, handleDone);
    engineRef.current = engine;
    engine.resize();
    setCardW(engine.cardWidth);
    engine.start();
    const ro = new ResizeObserver(() => {
      engine.resize();
      setCardW(engine.cardWidth);
    });
    ro.observe(root);
    const onMove = (e: PointerEvent) => engine.pointerMove(e.clientX, e.clientY);
    const onLeave = () => engine.pointerLeave();
    const onVis = () => (document.hidden ? engine.stop() : engine.start());
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      engine.destroy();
      engineRef.current = null;
    };
  }, [handleDone]);

  useEffect(() => {
    engineRef.current?.setReduced(reducedMotion);
  }, [reducedMotion]);

  useLayoutEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setInsets(insets.top, insets.bottom);
    setCardW(engine.cardWidth);
  }, [insets.top, insets.bottom]);

  useEffect(() => {
    engineRef.current?.syncPool(pool);
  }, [pool]);

  useLayoutEffect(() => {
    engineRef.current?.syncEntries(shown, elsRef.current);
  }, [shown]);

  // drawToken bump → spin the vortex up (after the unlocked cards start leaving)
  const lastToken = useRef(drawToken);
  useEffect(() => {
    if (drawToken === lastToken.current) return;
    lastToken.current = drawToken;
    engineRef.current?.spinUp(260);
  }, [drawToken]);

  // draw resolved without dealing (error / nothing new) → settle
  useEffect(() => {
    if (phase !== "drawing") engineRef.current?.settle();
  }, [phase]);

  const registerEl = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) elsRef.current.set(key, el);
    else elsRef.current.delete(key);
  }, []);

  const handleDismiss = useCallback(
    (card: RecommendCard) => {
      const key = cardKey(card);
      setDismissing((d) => new Set(d).add(key));
      onDismiss(card);
    },
    [onDismiss]
  );

  const busy = phase === "drawing";

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={skyRef} aria-hidden className="pointer-events-none absolute inset-0 block" />
      <div ref={stageRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div ref={nebulaRef} className="rc-nebula" />
      </div>
      <div aria-hidden className="rc-vignette" />
      <div ref={dimmerRef} aria-hidden className="rc-dimmer" data-on="false" />
      <div className="pointer-events-none absolute inset-0">
        {shown.map((s) => {
          const locked = lockedKeys.has(s.key);
          const label = s.card.type === "movie" ? s.card.title : s.card.name;
          return (
            <div
              key={s.key}
              ref={(el) => registerEl(s.key, el)}
              className="rc-hc rc-card"
              data-rc-card=""
              data-kind={s.card.type}
              data-locked={locked}
              data-stale={staleKeys.has(s.key)}
              role="button"
              tabIndex={s.leaving ? -1 : 0}
              aria-label={label}
              style={{ zIndex: s.leaving ? 1 : 2 }}
              onPointerEnter={() => {
                if (!s.leaving) onHover(s.card);
              }}
              onPointerMove={(e) => {
                if (!s.leaving) engineRef.current?.tilt(s.key, e.clientX, e.clientY);
              }}
              onPointerLeave={() => {
                engineRef.current?.untilt(s.key);
                onHover(null);
              }}
              onFocus={() => {
                if (!s.leaving) onHover(s.card);
              }}
              onClick={(e) => {
                if (s.leaving || !engineRef.current?.isResting(s.key)) return;
                if (s.card.type === "movie") {
                  onOpenMovie(s.card, e.currentTarget.querySelector<HTMLElement>("[data-rc-poster]"));
                } else onOpenPerson(s.card);
              }}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                e.preventDefault();
                e.currentTarget.click();
              }}
            >
              <div className="rc-flash" />
              <div className="rc-hin">
                <HandCardFace
                  card={s.card}
                  locked={locked}
                  stale={staleKeys.has(s.key)}
                  width={cardW}
                  interactive={!busy && !s.leaving}
                  onToggleLock={onToggleLock}
                  onDismiss={handleDismiss}
                  onPlay={onPlay}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const VORTEX_SCENE: RecommendSceneDef = {
  id: "vortex",
  Component: VortexScene,
  // 260ms for the unlocked cards to start leaving + 1150ms of spin-up
  drawLeadMs: 1410,
  // last card's deal stagger + flight
  dealMs: (HAND_SIZE - 1) * DEAL_STAGGER + FLY_IN_MS,
};

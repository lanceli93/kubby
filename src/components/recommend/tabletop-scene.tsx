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
 * 牌桌洗牌 Tabletop — the second recommend scene, ported from
 * data/demos/recommend/a-tabletop.html.
 *
 * The candidate pool lies scattered face-up on a tilted felt table. A draw
 * tosses the unlocked hand back onto the pile, gathers the pile into a
 * face-down deck, riffles it twice, deals the new cards face-down into a fanned
 * arc, tosses the rest of the deck back face-up and flips the hand left → right
 * with a light sweep (the actor card pops higher). Filter changes slide
 * non-matching cards off the table edge and land newcomers back on it.
 *
 * Layout (kept from the demo's final fix): `computeLayout()` reserves a clear
 * band above the draw button, `fitPile()` solves the tilted table's centre and
 * depth so its projected far/near edges land inside that band, and `liftComp()`
 * cancels the downward drift of cards lifted toward the viewer (the
 * perspective origin sits above them).
 *
 * Motion: every card is a damped spring body; ONE rAF loop steps the active
 * bodies and sleeps when all are at rest (and while the tab is hidden). Only
 * transform / opacity are written per frame. Pile cards are imperative DOM;
 * hand cards are React wrappers around the shared `HandCardFace`, positioned
 * by the same springs. A hand card dealt from the deck starts at the deck's
 * top pose face-down (all backs look the same), and one tossed back is swapped
 * for a pile card at its landing pose — so the two layers read as one table.
 */

// ── helpers ───────────────────────────────────────────────────────────────
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const f2 = (x: number) => Math.round(x * 100) / 100;
function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const PERSP = 1500; // must match .rc-tt-layer perspective
const TILT = 50; // table tilt (deg)
const FAN_A = 4.2; // per-slot fan rotation (deg)
const FAN_ARC = 0.025; // arc drop (× hand card height × off²)
const MID = (HAND_SIZE - 1) / 2;
/** Real pile cards are capped (each one is a 3D layer); actors are accents. */
const PILE_CAP = 64;
const ACTOR_CAP = 10;
/** Hand cards are this much bigger than the pile's base card size. */
const HAND_SCALE = 1.3;
const OUT_GC_MS = 2600;

// timings of the draw choreography (ms) — also feed the scene definition
const DEAL_STEP = 125;
const FLIP_STEP = 150;

// ── spring bodies ─────────────────────────────────────────────────────────
const EPS: Record<string, number> = { s: 0.0004, o: 0.002, sx: 0.0004, sy: 0.0004 };

type Vals = Record<string, number>;

class Spring {
  p: Vals = {};
  v: Vals = {};
  t: Vals = {};
  k: Vals = {};
  c: Vals = {};
  active = true;
  constructor(
    readonly keys: readonly string[],
    init: Vals,
    readonly render: () => void,
    private wake: (b: Spring) => void
  ) {
    for (const key of keys) {
      this.p[key] = this.t[key] = init[key] ?? 0;
      this.v[key] = 0;
      this.k[key] = 170;
      this.c[key] = 24;
    }
    wake(this);
  }
  to(tg: Vals, k = 170, c = 24) {
    for (const key in tg) {
      if (!(key in this.p)) continue;
      this.t[key] = tg[key];
      this.k[key] = k;
      this.c[key] = c;
    }
    this.wake(this);
    return this;
  }
  set(vals: Vals) {
    for (const key in vals) {
      if (!(key in this.p)) continue;
      this.p[key] = this.t[key] = vals[key];
      this.v[key] = 0;
    }
    this.wake(this);
    return this;
  }
  kick(dv: Vals) {
    for (const key in dv) if (key in this.v) this.v[key] += dv[key];
    this.wake(this);
  }
  step(dt: number) {
    let moving = false;
    const { p, v, t } = this;
    for (const key of this.keys) {
      const x = p[key];
      const tg = t[key];
      let vel = v[key];
      if (vel === 0 && x === tg) continue;
      vel += (this.k[key] * (tg - x) - this.c[key] * vel) * dt;
      const nx = x + vel * dt;
      const e = EPS[key] ?? 0.02;
      if (Math.abs(vel) < e * 4 && Math.abs(tg - nx) < e) {
        p[key] = tg;
        v[key] = 0;
      } else {
        p[key] = nx;
        v[key] = vel;
        moving = true;
      }
    }
    return moving;
  }
}

const CARD_KEYS = ["X", "Y", "Z", "T", "tx", "ty", "u", "v", "h", "rz", "ry", "s", "o"] as const;

// ── card back: drawn once into an image shared by every back face ─────────
let backUrl: string | null = null;
function cardBackUrl(): string | null {
  if (backUrl || typeof document === "undefined") return backUrl;
  const W = 360;
  const H = 540;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d");
  if (!g) return null;
  const bg = g.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, "#23234a");
  bg.addColorStop(0.6, "#141428");
  bg.addColorStop(1, "#101020");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.55);
  glow.addColorStop(0, "rgba(129,140,248,.28)");
  glow.addColorStop(1, "rgba(129,140,248,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  // cross-hatch
  g.strokeStyle = "rgba(255,255,255,.035)";
  g.lineWidth = 4;
  for (let d = -H; d < W + H; d += 22) {
    g.beginPath();
    g.moveTo(d, 0);
    g.lineTo(d + H, H);
    g.moveTo(d, H);
    g.lineTo(d + H, 0);
    g.stroke();
  }
  // gold frame
  const inset = W * 0.06;
  g.lineWidth = 9;
  g.strokeStyle = "rgba(10,10,20,.6)";
  g.beginPath();
  g.roundRect(inset, inset, W - inset * 2, H - inset * 2, 16);
  g.stroke();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(202,138,4,.6)";
  g.stroke();
  // medallion
  const r = W * 0.17;
  g.save();
  g.shadowColor = "rgba(202,138,4,.35)";
  g.shadowBlur = 30;
  const mg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
  mg.addColorStop(0, "#2a2a55");
  mg.addColorStop(1, "#17172e");
  g.fillStyle = mg;
  g.beginPath();
  g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.lineWidth = 2;
  g.strokeStyle = "rgba(234,179,8,.6)";
  g.stroke();
  g.fillStyle = "#f5d27a";
  g.font = `800 ${Math.round(W * 0.17)}px Inter, system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("K", W / 2, H / 2 + 2);
  try {
    backUrl = cv.toDataURL("image/png");
  } catch {
    backUrl = null;
  }
  return backUrl;
}

// ── engine types ──────────────────────────────────────────────────────────
interface Vis {
  el: HTMLDivElement;
  flip: HTMLDivElement | null;
  shade: HTMLDivElement | null;
  body: Spring;
  _o: number;
  _ry: number;
  _lift: number;
}

type PileState = "pile" | "out" | "deck" | "taken";

interface PileCard extends Vis {
  key: string;
  kind: "movie" | "person";
  state: PileState;
  pu: number;
  pv: number;
  prz: number;
  layer: number;
  dk: { u: number; v: number; h: number; rz: number; ry: number };
  outAt: number;
}

type HandMode = "wait" | "deal" | "rest" | "back" | "dismiss";

interface HandEntry extends Vis {
  key: string;
  card: RecommendCard;
  slot: number;
  mode: HandMode;
  faceUp: boolean;
  hov: boolean;
  locked: boolean;
  sweep: HTMLDivElement | null;
  /** bumps whenever the entry's choreography restarts — stale timers bail */
  gen: number;
}

interface Shown {
  key: string;
  card: RecommendCard;
  slot: number;
  leaving: null | "back" | "dismiss";
}

interface DrawRun {
  queue: HandEntry[];
  resolved: boolean;
  wake: (() => void) | null;
}

interface PileGeo {
  X: number;
  Y: number;
  Rv: number;
  Ru: number;
  s: number;
  D: number;
  e: number;
}

// ── engine ────────────────────────────────────────────────────────────────
class TabletopEngine {
  private V = { w: 0, h: 0, left: 0, top: 0 };
  private L = {
    W: 120,
    H: 180,
    HW: 156,
    HH: 234,
    /** pile card size / hand card size — converts `s` between the layers */
    k: 1 / HAND_SCALE,
    y0: 0,
    mode: "idle" as "idle" | "hand",
    slots: [] as { x: number; y: number; a: number }[],
    idle: null as PileGeo | null,
    hand: null as PileGeo | null,
  };
  private insets = { top: 0, bottom: 0 };
  private bodies = new Set<Spring>();
  private pile: PileCard[] = [];
  private hand = new Map<string, HandEntry>();
  private felt: Spring;
  private raf = 0;
  private last = 0;
  private running = false;
  private dead = false;
  private reduced = false;
  private seeded = false;
  private synced = false;
  private layerSeq = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private draw: DrawRun | null = null;
  private pendingPool: PoolItem[] | null = null;
  private backStagger = { at: 0, n: 0 };

  constructor(
    private root: HTMLDivElement,
    private pileLayer: HTMLDivElement,
    private handLayer: HTMLDivElement,
    feltEl: HTMLDivElement,
    private onDone: (key: string) => void
  ) {
    const url = cardBackUrl();
    if (url) root.style.setProperty("--rc-tt-back", `url(${url})`);
    this.felt = new Spring(
      ["X", "Y", "T", "sx", "sy", "o"],
      { T: TILT, sx: 0.3, sy: 0.3, o: 0 },
      () => {
        const p = this.felt.p;
        feltEl.style.transform = `translate3d(${f2(p.X)}px,${f2(p.Y)}px,0) rotateX(${f2(p.T)}deg) scale(${p.sx.toFixed(4)},${p.sy.toFixed(4)})`;
        feltEl.style.opacity = clamp(p.o, 0, 1).toFixed(3);
      },
      this.wakeBody
    );
  }

  // ── lifecycle / loop ──
  private wakeBody = (b: Spring) => {
    b.active = true;
    this.bodies.add(b);
    this.kick();
  };
  private kick() {
    if (this.running || this.dead || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    let any = false;
    for (const b of this.bodies) {
      if (!b.active) continue;
      let m = false;
      for (let i = 0; i < n; i++) m = b.step(h);
      b.render();
      if (m) any = true;
      else b.active = false;
    }
    if (any) this.raf = requestAnimationFrame(this.frame);
    else this.running = false;
  };
  /** Tab hidden → stop the loop; visible → resume whatever is still moving. */
  visibility(hidden: boolean) {
    if (hidden) {
      this.running = false;
      cancelAnimationFrame(this.raf);
      return;
    }
    for (const b of this.bodies) {
      if (b.active) {
        this.kick();
        return;
      }
    }
  }
  destroy() {
    this.dead = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    for (const c of this.pile) c.el.remove();
    this.pile = [];
    this.hand.clear();
    this.bodies.clear();
    this.draw = null;
  }
  private later(fn: () => void, ms: number) {
    if (this.dead) return;
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.dead) fn();
    }, ms);
    this.timers.add(id);
  }
  private wait(ms: number) {
    return new Promise<void>((r) => this.later(r, ms));
  }

  setReduced(r: boolean) {
    this.reduced = r;
  }
  setInsets(top: number, bottom: number) {
    if (top === this.insets.top && bottom === this.insets.bottom) return;
    this.insets = { top, bottom };
    this.relayout();
  }
  resize() {
    const b = this.root.getBoundingClientRect();
    this.V = { w: b.width, h: b.height, left: b.left, top: b.top };
    this.relayout();
  }
  private relayout() {
    if (this.V.w <= 0 || this.V.h <= 0) return;
    this.computeLayout();
    if (!this.seeded) return;
    this.placeFelt(200, 26);
    for (const c of this.pile) if (c.state !== "taken") this.placePile(c, 200, 26);
    for (const e of this.hand.values()) if (e.mode === "rest") this.placeHand(e, 200, 26);
  }
  get handWidth() {
    return this.L.HW;
  }

  // ── rendering ──
  private renderVis(c: Vis) {
    const p = c.body.p;
    // cards lean slightly into their direction of travel (air drag) — reads as weight
    const lean = clamp((c.body.v.X + c.body.v.u) * 0.0042, -9, 9);
    c.el.style.transform = `translate3d(${f2(p.X)}px,${f2(p.Y)}px,${f2(p.Z)}px) rotateX(${f2(p.T + p.tx)}deg) rotateY(${f2(p.ty)}deg) translate3d(${f2(p.u)}px,${f2(p.v)}px,${f2(p.h)}px) rotateZ(${f2(p.rz + lean)}deg) scale(${p.s.toFixed(4)})`;
    const o = clamp(p.o, 0, 1);
    if (o !== c._o) {
      c.el.style.opacity = o.toFixed(3);
      c.el.style.visibility = o < 0.01 ? "hidden" : "visible";
      c._o = o;
    }
    if (c.flip && p.ry !== c._ry) {
      c.flip.style.transform = `rotateY(${f2(p.ry)}deg)`;
      c._ry = p.ry;
    }
    const lift = Math.max(0, p.Z + p.h);
    if (c.shade && Math.abs(lift - c._lift) > 0.05) {
      c.shade.style.transform = `translate3d(0,${f2(lift * 0.22 + 4)}px,0) scale(${(1 + lift * 0.0022).toFixed(4)})`;
      c.shade.style.opacity = (0.6 - (Math.min(lift, 220) / 220) * 0.32).toFixed(3);
      c._lift = lift;
    }
  }
  private newBody(c: Omit<Vis, "body">, init: Vals): Spring {
    const vis = c as Vis;
    return new Spring(CARD_KEYS, init, () => this.renderVis(vis), this.wakeBody);
  }
  /** Spring toward a target — reduced motion snaps positions and only fades. */
  private move(b: Spring, tg: Vals, k: number, d: number) {
    if (!this.reduced) {
      b.to(tg, k, d);
      return;
    }
    const rest: Vals = { ...tg };
    delete rest.o;
    b.set(rest);
    if (tg.o !== undefined) b.to({ o: tg.o }, 120, 22);
  }
  private nudge(b: Spring, dv: Vals) {
    if (!this.reduced) b.kick(dv);
  }

  // ── layout ──
  private fitPile(a: number, b: number, y0: number, s: number, H: number) {
    // Fit the tilted pile into the screen band [a, b]: solve the table centre Y
    // and in-plane half-depth D so the projected far edge lands on a and the
    // near edge on b. Projection of in-plane offset v:
    // y0 + (Y - y0 + v·cosT) · P / (P - v·sinT).
    const T = (TILT * Math.PI) / 180;
    const cs = Math.cos(T);
    const sn = Math.sin(T);
    const e = s * 0.9 * H; // half-diagonal of a scaled card: covers any rotateZ
    const D = (b - a) / (2 * cs + (sn * (a + b - 2 * y0)) / PERSP);
    const Y = y0 + ((b - y0) * (PERSP - D * sn)) / PERSP - D * cs;
    return { Y, D, e, Rv: Math.max(D - e, D * 0.25), mag: PERSP / (PERSP - D * sn) };
  }
  private computeLayout() {
    const L = this.L;
    const vw = this.V.w;
    const top = this.insets.top + 10;
    // nothing on the table or in the hand goes below this band (draw button)
    const band = this.V.h - this.insets.bottom - 18;
    const avail = Math.max(240, band - top);
    const scale = getRootScale();
    const W = Math.round(clamp(Math.min(vw * 0.12, (avail * 0.36) / 1.5), 72, 190 * scale));
    const H = Math.round(W * 1.5);
    // hand cards: bigger than the pile's, but the fan must fit the width and
    // leave the receded pile a usable band above it
    let HW = Math.min(W * HAND_SCALE, (avail * 0.46) / 1.5, (vw - 36) / (1 + (HAND_SIZE - 1) * 0.62));
    HW = Math.round(Math.max(HW, Math.min(W, 72)));
    const HH = Math.round(HW * 1.5);
    L.W = W;
    L.H = H;
    L.HW = HW;
    L.HH = HH;
    L.k = W / HW;
    const st = this.root.style;
    st.setProperty("--tw", `${W}px`);
    st.setProperty("--th", `${H}px`);
    st.setProperty("--hw", `${HW}px`);
    st.setProperty("--hh", `${HH}px`);
    st.setProperty("--cw", `${HW}px`);
    const y0 = top - 40;
    L.y0 = y0;
    const origin = `50% ${Math.round(y0)}px`;
    this.pileLayer.style.perspectiveOrigin = origin;
    this.handLayer.style.perspectiveOrigin = origin;
    // hand: the lowest point (outer cards: arc drop + rotated corner + hover
    // headroom) sits 10px above the band
    const aR = (MID * FAN_A * Math.PI) / 180;
    const below = MID * MID * FAN_ARC * HH + (HH / 2) * (Math.cos(aR) - 1) + (HW / 2) * Math.sin(aR) + HH * 0.03;
    const handY = band - 10 - below - HH / 2;
    const spacing = Math.min(HW * 1.12, (vw - 36 - HW) / (HAND_SIZE - 1));
    L.slots = Array.from({ length: HAND_SIZE }, (_, i) => {
      const off = i - MID;
      return { x: vw / 2 + off * spacing, y: handY + off * off * HH * FAN_ARC, a: off * FAN_A };
    });
    const handTop = handY - HH / 2;
    const mk = (a: number, b: number, s: number, ruMax: number): PileGeo => {
      const f = this.fitPile(a, Math.max(b, a + 90), y0, s, H);
      const Ru = Math.max(60, Math.min(ruMax, (vw / 2 - 28) / f.mag - f.e));
      return { X: vw / 2, Y: f.Y, Rv: f.Rv, Ru, s, D: f.D, e: f.e };
    };
    // idle: the pile owns the whole stage; with a hand it recedes into the band
    // above the hand (near edge tucks 8% under it)
    L.idle = mk(top + 6, band - 8, 0.74, Math.min(vw * 0.33, 600));
    L.hand = mk(top + 6, handTop + HH * 0.08, 0.46, Math.min(vw * 0.28, 470));
  }
  /** screen-space Y offset cancelling the downward drift of a card lifted by Z */
  private liftComp(y: number, Z: number) {
    return ((y - this.L.y0) * Z) / PERSP;
  }
  private geo(): PileGeo {
    return (this.L.mode === "hand" ? this.L.hand : this.L.idle)!;
  }
  private placeFelt(k = 120, c = 22) {
    const t = this.geo();
    this.move(this.felt, { X: t.X, Y: t.Y, T: TILT, sx: ((t.Ru + t.e) * 2.4) / 1000, sy: (t.D * 2.16) / 1000, o: 1 }, k, c);
  }
  private setMode(mode: "idle" | "hand") {
    if (this.L.mode === mode) return;
    this.L.mode = mode;
    if (!this.seeded) return;
    this.placeFelt(90, 18);
    for (const c of this.pile) if (c.state === "pile" || c.state === "out") this.placePile(c, 110, 19);
  }
  private hasHand() {
    for (const e of this.hand.values()) if (e.mode !== "back" && e.mode !== "dismiss") return true;
    return false;
  }
  private updateMode() {
    if (!this.draw) this.setMode(this.hasHand() ? "hand" : "idle");
  }

  // ── pile ──
  private pileTarget(c: PileCard): Vals {
    const t = this.geo();
    const base = { X: t.X, Y: t.Y, Z: 0, T: TILT, tx: 0, ty: 0, s: t.s };
    if (c.state === "deck") return { ...base, ...c.dk, o: 1 };
    if (c.state === "out")
      // just past the table edge, fading — "slid off"
      return { ...base, u: c.pu * t.Ru * 1.75, v: c.pv * t.Rv * 1.6 + t.Rv * 0.25, h: 70, rz: c.prz * 1.6, ry: 0, o: 0, s: t.s * 0.82 };
    return { ...base, u: c.pu * t.Ru, v: c.pv * t.Rv, h: (c.layer % 40) * 0.12, rz: c.prz, ry: 0, o: c.state === "taken" ? 0 : 1 };
  }
  private placePile(c: PileCard, k: number, d: number) {
    this.move(c.body, this.pileTarget(c), k, d);
  }
  private setLayer(c: Vis, z: number) {
    c.el.style.zIndex = String(z);
  }
  private scatter(c: PileCard) {
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    c.pu = clamp(g() * 1.15, -1, 1);
    c.pv = clamp(g() * 1.05, -1, 1);
    c.prz = rand(-42, 42);
    c.layer = ++this.layerSeq;
    this.setLayer(c, 10 + c.layer);
  }
  private makePile(key: string, kind: "movie" | "person", image: string | null, blur: string | null): PileCard {
    const el = document.createElement("div");
    el.className = "rc-tt-card";
    const shade = document.createElement("div");
    shade.className = "rc-tt-shade";
    const flip = document.createElement("div");
    flip.className = "rc-tt-flip";
    const front = document.createElement("div");
    front.className = `rc-tt-face${kind === "person" ? " actor" : ""}`;
    if (blur) front.style.backgroundImage = `url(${blur})`;
    if (image) {
      const img = document.createElement("img");
      img.decoding = "async";
      img.draggable = false;
      img.alt = "";
      img.src = resolveImageSrc(image, 200);
      front.appendChild(img);
    }
    const back = document.createElement("div");
    back.className = "rc-tt-face rc-tt-back";
    flip.append(front, back);
    el.append(shade, flip);
    this.pileLayer.appendChild(el);
    const c = {
      key,
      kind,
      el,
      flip,
      shade,
      state: "pile",
      pu: 0,
      pv: 0,
      prz: 0,
      layer: 0,
      dk: { u: 0, v: 0, h: 0, rz: 0, ry: 180 },
      outAt: 0,
      _o: -1,
      _ry: NaN,
      _lift: -1,
    } as Omit<PileCard, "body"> as PileCard;
    c.body = this.newBody(c, { s: 1, o: 0, T: TILT });
    this.pile.push(c);
    return c;
  }
  private removePile(c: PileCard) {
    c.el.remove();
    this.bodies.delete(c.body);
    this.pile = this.pile.filter((x) => x !== c);
  }
  private findPile(key: string) {
    return this.pile.find((c) => c.key === key) ?? null;
  }
  /** Toss a fresh card onto the table from above the far edge. */
  private tossIn(c: PileCard, delay: number) {
    const t = this.geo();
    this.scatter(c);
    c.state = "pile";
    if (this.reduced) {
      c.body.set({ ...this.pileTarget(c), o: 0 });
      this.later(() => this.placePile(c, 120, 22), delay * 0.3);
      return;
    }
    c.body.set({
      X: t.X,
      Y: t.Y - 40,
      Z: 520,
      T: TILT * 0.4,
      u: c.pu * t.Ru * 0.3,
      v: -t.Rv * 0.6,
      h: 0,
      rz: c.prz + rand(-120, 120),
      ry: 0,
      s: t.s,
      o: 0,
      tx: 0,
      ty: 0,
    });
    this.later(() => {
      if (c.state === "pile") this.placePile(c, rand(85, 120), rand(13, 16));
    }, delay);
  }

  /** Diff the pile against a new pool sample: leavers slide off the table
   *  edge, returning cards land back on it, newcomers are tossed in. Deferred
   *  while a draw is running. */
  syncPool(pool: PoolItem[]) {
    if (this.V.w <= 0) return;
    if (this.draw) {
      this.pendingPool = pool;
      return;
    }
    this.pendingPool = null;
    const first = !this.seeded;
    if (first) {
      if (!pool.length) return;
      this.seeded = true;
      const t = this.geo();
      this.felt.set({ X: t.X, Y: t.Y, T: TILT, sx: 0.3, sy: 0.3, o: 0 });
      this.placeFelt(70, 16);
    }
    const now = performance.now();
    const byKey = new Map(pool.map((p) => [cardKey(p), p]));
    const handKeys = new Set(this.hand.keys());
    let iIn = 0;
    let iOut = 0;
    let real = 0;
    let actors = 0;
    for (const c of [...this.pile]) {
      if (c.state === "taken" || c.state === "deck") {
        real++;
        continue;
      }
      const m = byKey.has(c.key);
      if (m && c.state === "out") {
        // fly back in from just off the table edge, land on top of the pile
        this.scatter(c);
        c.state = "pile";
        const d = iIn++ * 28 + rand(0, 60);
        this.later(() => {
          if (c.state !== "pile") return;
          this.placePile(c, 120, 17);
          this.nudge(c.body, { h: 380 });
        }, d);
      } else if (!m && c.state === "pile") {
        c.state = "out";
        c.outAt = now;
        const d = iOut++ * 18 + rand(0, 50);
        this.later(() => {
          if (c.state !== "out") return;
          this.placePile(c, 90, 15);
          this.nudge(c.body, { h: 260 });
        }, d);
        this.later(() => {
          if (c.state === "out" && performance.now() - c.outAt >= OUT_GC_MS - 50) this.removePile(c);
        }, OUT_GC_MS);
      }
      if (c.state === "pile") {
        real++;
        if (c.kind === "person") actors++;
      }
    }
    // newcomers (one card per pool item, capped; hand cards are already on the table)
    const fresh = pool.filter((p) => {
      const k = cardKey(p);
      return !handKeys.has(k) && !this.pile.some((c) => c.key === k);
    });
    const add: PoolItem[] = [];
    for (const p of shuffle(fresh)) {
      if (real >= PILE_CAP) break;
      if (p.type === "person") {
        if (actors >= ACTOR_CAP) continue;
        actors++;
      }
      add.push(p);
      real++;
    }
    const step = first ? Math.min(32, 1600 / Math.max(1, add.length)) : Math.min(28, 700 / Math.max(1, add.length));
    add.forEach((p, i) => {
      const c = this.makePile(cardKey(p), p.type, p.image, p.blur);
      this.tossIn(c, (first ? 200 : 120) + i * step + (first ? 0 : rand(0, 60)));
    });
  }

  // ── hand ──
  private slotOf(e: HandEntry) {
    return this.L.slots[e.slot] ?? this.L.slots[0] ?? { x: this.V.w / 2, y: this.V.h / 2, a: 0 };
  }
  private handTarget(e: HandEntry): Vals {
    const sl = this.slotOf(e);
    const lift = e.hov ? 34 : e.locked ? 8 : 0;
    // lift toward the viewer drifts down under the high perspective origin —
    // cancel it, plus a small rise so hover reads as "up"
    return {
      X: sl.x,
      Y: sl.y - this.liftComp(sl.y, lift) - lift * 0.25,
      Z: lift,
      T: 0,
      u: 0,
      v: 0,
      h: 0,
      rz: e.hov ? sl.a * 0.5 : sl.a,
      ry: e.faceUp ? 0 : 180,
      s: e.hov ? 1.045 : 1,
      o: 1,
      tx: e.hov ? e.body.t.tx : 0,
      ty: e.hov ? e.body.t.ty : 0,
    };
  }
  private placeHand(e: HandEntry, k: number, d: number) {
    this.move(e.body, this.handTarget(e), k, d);
  }
  /** A hand card's pose lying on the pile (its scale converted to the hand layer). */
  private pilePose(pu: number, pv: number, prz: number, h: number, ry: number): Vals {
    const t = this.geo();
    return { X: t.X, Y: t.Y, Z: 0, T: TILT, tx: 0, ty: 0, u: pu * t.Ru, v: pv * t.Rv, h, rz: prz, ry, s: t.s * this.L.k, o: 1 };
  }
  private makeHand(s: Shown, el: HTMLDivElement): HandEntry {
    const e = {
      key: s.key,
      card: s.card,
      slot: s.slot,
      mode: "wait",
      faceUp: true,
      hov: false,
      locked: el.dataset.locked === "true",
      el,
      flip: el.querySelector<HTMLDivElement>(".rc-tt-flip"),
      shade: el.querySelector<HTMLDivElement>(".rc-tt-shade"),
      sweep: el.querySelector<HTMLDivElement>(".rc-tt-sweep"),
      gen: 0,
      _o: -1,
      _ry: NaN,
      _lift: -1,
    } as Omit<HandEntry, "body"> as HandEntry;
    e.body = this.newBody(e, { o: 0, s: 1 });
    el.dataset.flying = "true";
    this.hand.set(s.key, e);
    return e;
  }
  private dropEntry(e: HandEntry) {
    this.bodies.delete(e.body);
    if (this.hand.get(e.key) === e) this.hand.delete(e.key);
    e.el.style.opacity = "0";
    this.onDone(e.key);
    this.updateMode();
  }
  private toRest(e: HandEntry, gen: number) {
    if (e.gen !== gen || this.hand.get(e.key) !== e) return;
    e.mode = "rest";
    e.faceUp = true;
    e.el.dataset.flying = "false";
    this.setLayer(e, 100 + e.slot * 10);
    this.placeHand(e, 170, 22);
  }
  private sweepLight(e: HandEntry) {
    e.sweep?.animate(
      [
        { transform: "translateX(-30%) skewX(-12deg)", opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { transform: "translateX(330%) skewX(-12deg)", opacity: 0 },
      ],
      { duration: 1000, easing: "cubic-bezier(.3,.6,.2,1)" }
    );
  }
  /** Flip face-up with a pop toward the viewer (actor cards pop higher). */
  private flipUp(e: HandEntry) {
    const actor = e.card.type === "person";
    e.faceUp = true;
    e.body.to({ ry: 0 }, actor ? 120 : 150, actor ? 12 : 15);
    const pop = actor ? 900 : 620;
    const sl = this.slotOf(e);
    this.nudge(e.body, { Z: pop, Y: (-pop * (sl.y - this.L.y0)) / PERSP });
    if (!this.reduced) this.later(() => this.sweepLight(e), 170);
  }
  /** Hide the pile card standing for this hand card (no duplicates on the table). */
  private takeFromPile(key: string) {
    const c = this.findPile(key);
    if (!c || c.state === "taken") return c;
    c.state = "taken";
    c.body.set({ o: 0 });
    return c;
  }

  /** Reconcile engine state with the React-rendered hand entries. */
  syncEntries(shown: Shown[], els: Map<string, HTMLDivElement>) {
    const first = !this.synced;
    this.synced = true;
    const live = new Set(shown.map((s) => s.key));
    for (const [key, e] of this.hand) {
      if (live.has(key)) continue;
      this.bodies.delete(e.body);
      this.hand.delete(key);
    }
    const fresh: HandEntry[] = [];
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
        e = this.makeHand(s, el);
        fresh.push(e);
        continue;
      }
      e.card = s.card;
      if (s.leaving && e.mode !== "back" && e.mode !== "dismiss") {
        this.startLeave(e, s.leaving);
      } else if (!s.leaving && (e.mode === "back" || e.mode === "dismiss")) {
        // came back while leaving (repeat draw) — deal it in again
        e.gen++;
        e.slot = s.slot;
        e.el.dataset.returning = "false";
        fresh.push(e);
      } else if (!s.leaving && e.slot !== s.slot) {
        e.slot = s.slot;
        if (e.mode === "rest") this.placeHand(e, 170, 22);
      }
    }
    if (fresh.length) {
      fresh.sort((a, b) => a.slot - b.slot);
      if (first) this.restore(fresh);
      else if (this.draw) {
        for (const e of fresh) {
          e.mode = "wait";
          e.gen++;
          e.body.set({ o: 0 });
        }
        this.draw.queue.push(...fresh);
        this.draw.wake?.();
      } else fresh.forEach((e, i) => this.refill(e, i * 90));
    }
    this.updateMode();
  }

  /** Mount with a hand already on the table (theme switch / back navigation):
   *  the cards settle straight into their slots — no shuffle replay. */
  private restore(list: HandEntry[]) {
    this.setMode("hand");
    list.forEach((e, i) => {
      const g = ++e.gen;
      e.mode = "deal";
      e.faceUp = true;
      this.takeFromPile(e.key);
      this.setLayer(e, 100 + e.slot * 10);
      const tg = this.handTarget(e);
      if (this.reduced) {
        e.body.set({ ...tg, o: 0 });
        e.body.to({ o: 1 }, 120, 22);
        this.later(() => this.toRest(e, g), 300);
        return;
      }
      e.body.set({ ...tg, Z: 140, Y: tg.Y - this.liftComp(tg.Y, 140) - 24, o: 0 });
      this.later(() => {
        if (e.gen === g) this.move(e.body, tg, 140, 18);
      }, i * 70);
      this.later(() => this.toRest(e, g), i * 70 + 460);
    });
  }

  /** A single card outside a full draw (dismiss refill): picked off the table
   *  if it lies there face-up, otherwise drawn face-down from the pile. */
  private refill(e: HandEntry, delay: number) {
    const g = ++e.gen;
    e.mode = "deal";
    this.setMode("hand");
    this.setLayer(e, 100 + e.slot * 10);
    const src = this.findPile(e.key);
    const visible = src && src.state === "pile" && src._o > 0.5;
    this.takeFromPile(e.key);
    if (this.reduced) {
      e.faceUp = true;
      e.body.set({ ...this.handTarget(e), o: 0 });
      e.body.to({ o: 1 }, 120, 22);
      this.later(() => this.toRest(e, g), 300);
      return;
    }
    if (src && visible) {
      e.faceUp = true;
      const p = src.body.p;
      e.body.set({ ...p, s: p.s / this.L.k, o: 1 });
      this.later(() => {
        if (e.gen !== g) return;
        this.placeHand(e, 120, 16);
        this.nudge(e.body, { Z: 400 });
      }, delay);
      this.later(() => this.toRest(e, g), delay + 700);
      return;
    }
    e.faceUp = false;
    e.body.set({ ...this.pilePose(0, 0, rand(-3, 3), 8, 180), o: 0 });
    e.body.to({ o: 1 }, 260, 32);
    this.later(() => {
      if (e.gen !== g) return;
      const sl = this.slotOf(e);
      this.placeHand(e, 95, 15);
      e.body.to({ Z: 170, Y: sl.y - this.liftComp(sl.y, 170) - 30 }, 110, 15);
      this.later(() => {
        if (e.gen === g) e.body.to({ Z: 0, Y: sl.y }, 130, 15);
      }, 230);
    }, delay);
    this.later(() => {
      if (e.gen === g) this.flipUp(e);
    }, delay + 560);
    this.later(() => this.toRest(e, g), delay + 1050);
  }

  private startLeave(e: HandEntry, how: "back" | "dismiss") {
    const g = ++e.gen;
    e.hov = false;
    e.el.dataset.flying = "true";
    const p = e.body.p;
    if (how === "dismiss") {
      // thrown away: tossed up and off the side of the table, spinning
      e.mode = "dismiss";
      const dir = e.slot < MID ? -1 : e.slot > MID ? 1 : Math.random() < 0.5 ? -1 : 1;
      const taken = this.findPile(e.key);
      if (taken?.state === "taken") {
        taken.state = "out";
        taken.outAt = performance.now();
      }
      if (this.reduced) {
        e.body.to({ o: 0 }, 120, 22);
        this.later(() => this.dropEntry(e), 320);
        return;
      }
      e.body.to({ X: p.X + dir * this.L.HW * 2.6, Y: p.Y + this.L.HH * 0.35, Z: 60, rz: p.rz + dir * 60, s: 0.9, o: 0 }, 60, 12);
      e.body.kick({ Y: -700, Z: 300 });
      this.later(() => this.dropEntry(e), 720);
      return;
    }
    // back onto the pile (unlocked card on a redraw)
    e.mode = "back";
    e.el.dataset.returning = "true";
    const now = performance.now();
    if (now - this.backStagger.at > 60) this.backStagger = { at: now, n: 0 };
    const i = this.backStagger.n++;
    const gs = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const pu = clamp(gs() * 1.15, -1, 1);
    const pv = clamp(gs() * 1.05, -1, 1);
    const prz = rand(-42, 42);
    const pose = this.pilePose(pu, pv, prz, 2, 0);
    if (this.reduced) {
      e.body.set(pose);
      this.convertToPile(e, g, pu, pv, prz);
      return;
    }
    this.later(() => {
      if (e.gen !== g) return;
      e.body.to(pose, 105, 15);
      e.body.kick({ Z: 260, h: 300 });
    }, i * 60);
    this.later(() => this.convertToPile(e, g, pu, pv, prz), i * 60 + 420);
  }
  /** Swap a hand card that landed on the table for a pile card at the same
   *  pose + velocity (seamless), then let React drop the hand element. */
  private convertToPile(e: HandEntry, g: number, pu: number, pv: number, prz: number) {
    if (e.gen !== g || this.hand.get(e.key) !== e) return;
    let c = this.findPile(e.key);
    if (!c) {
      const card = e.card;
      c =
        card.type === "movie"
          ? this.makePile(e.key, "movie", card.posterPath, card.posterBlur)
          : this.makePile(e.key, "person", card.photoPath, card.photoBlur);
    }
    c.pu = pu;
    c.pv = pv;
    c.prz = prz;
    c.state = "pile";
    c.layer = ++this.layerSeq;
    this.setLayer(c, 10 + c.layer);
    for (const k of CARD_KEYS) {
      c.body.p[k] = e.body.p[k];
      c.body.v[k] = e.body.v[k];
    }
    c.body.p.s = e.body.p.s * this.L.k;
    c.body.v.s = e.body.v.s * this.L.k;
    c._o = -1;
    c._ry = NaN;
    this.renderVis(c);
    this.placePile(c, 105, 15);
    this.dropEntry(e);
  }

  // ── pointer / lock ──
  isResting(key: string) {
    return this.hand.get(key)?.mode === "rest";
  }
  hover(key: string, on: boolean) {
    const e = this.hand.get(key);
    if (!e || e.mode !== "rest" || e.hov === on) return;
    e.hov = on;
    if (on) {
      this.setLayer(e, 150);
      this.placeHand(e, 260, 24);
    } else {
      this.setLayer(e, 100 + e.slot * 10);
      e.body.to({ tx: 0, ty: 0 }, 120, 11); // soft springy release
      this.placeHand(e, 170, 19);
    }
  }
  /** Pointer over a hand card — tilt toward it. Uses the engine's own slot
   *  geometry (no getBoundingClientRect → no forced reflow per pointermove). */
  tilt(key: string, clientX: number, clientY: number) {
    const e = this.hand.get(key);
    if (!e || !e.hov || this.reduced) return;
    const sl = this.slotOf(e);
    const { HW, HH } = this.L;
    const px = clamp((clientX - this.V.left - (sl.x - HW / 2)) / HW, 0, 1);
    const py = clamp((clientY - this.V.top - (sl.y - HH / 2)) / HH, 0, 1);
    e.body.to({ tx: (0.5 - py) * 16, ty: (px - 0.5) * 20 }, 230, 28);
    const gx = `${(px * 100).toFixed(1)}%`;
    const gy = `${(py * 100).toFixed(1)}%`;
    e.el.style.setProperty("--gx", gx);
    e.el.style.setProperty("--gy", gy);
    e.el.style.setProperty("--hx", gx);
    e.el.style.setProperty("--hy", gy);
  }
  setLocked(key: string, locked: boolean) {
    const e = this.hand.get(key);
    if (!e || e.locked === locked) return;
    e.locked = locked;
    if (e.mode !== "rest") return;
    this.placeHand(e, 260, 20);
    this.nudge(e.body, { Z: locked ? 420 : -200 });
  }

  // ── the draw: gather → riffle ×2 → deal → toss back → flip ──
  /** drawToken bumped: the unlocked cards are already flying back (syncEntries). */
  beginDraw() {
    if (this.draw || this.dead) return;
    const d: DrawRun = { queue: [], resolved: false, wake: null };
    this.draw = d;
    void this.runDraw(d);
  }
  /** The page left the "drawing" phase (dealt / error / nothing new). */
  drawResolved() {
    const d = this.draw;
    if (!d) return;
    d.resolved = true;
    d.wake?.();
  }
  private alive(d: DrawRun) {
    return !this.dead && this.draw === d;
  }
  private untilWoken(d: DrawRun) {
    if (d.queue.length || d.resolved) return Promise.resolve();
    return new Promise<void>((r) => {
      d.wake = () => {
        d.wake = null;
        r();
      };
    });
  }
  private finishDraw(d: DrawRun) {
    if (this.draw !== d) return;
    this.draw = null;
    this.updateMode();
    if (this.pendingPool) this.syncPool(this.pendingPool);
  }

  private async runDraw(d: DrawRun) {
    // the table recedes to make room for the hand
    this.setMode("hand");
    for (const e of this.hand.values()) {
      if (e.mode !== "rest") continue;
      e.hov = false;
      this.placeHand(e, 170, 22);
    }
    if (this.reduced) {
      // no riffle: wait for the hand, fade it in at its slots
      await this.untilWoken(d);
      if (!this.alive(d)) return;
      const list = d.queue.splice(0);
      for (const e of list) {
        if (this.hand.get(e.key) !== e) continue;
        const g = ++e.gen;
        e.mode = "deal";
        e.faceUp = true;
        this.takeFromPile(e.key);
        this.setLayer(e, 100 + e.slot * 10);
        e.body.set({ ...this.handTarget(e), o: 0 });
        e.body.to({ o: 1 }, 120, 22);
        this.later(() => this.toRest(e, g), 300);
      }
      await this.wait(320);
      this.finishDraw(d);
      return;
    }

    let backs = 0;
    for (const e of this.hand.values()) if (e.mode === "back") backs++;
    await this.wait(backs ? 440 + backs * 60 : 140);
    if (!this.alive(d)) return;

    // 1. gather the pile into a face-down deck, nearest cards first
    const pool = this.pile.filter((c) => c.state === "pile");
    let deck = shuffle(pool);
    const at = new Map(deck.map((c, i) => [c, i]));
    const byDist = pool.slice().sort((a, b) => a.pu * a.pu + a.pv * a.pv - (b.pu * b.pu + b.pv * b.pv));
    const gStep = Math.min(14, 360 / Math.max(1, pool.length));
    deck.forEach((c, i) => {
      c.state = "deck";
      c.dk = { u: rand(-4, 4), v: rand(-4, 4), h: i * 0.55, rz: rand(-5, 5), ry: 180 };
    });
    byDist.forEach((c, r) =>
      this.later(() => {
        if (c.state !== "deck") return;
        this.setLayer(c, 5000 + (at.get(c) ?? 0));
        this.placePile(c, 150, 19);
        this.nudge(c.body, { h: 160 });
      }, r * gStep)
    );
    await this.wait(pool.length * gStep + 320);
    if (!this.alive(d)) return;

    // 2. riffle twice (the second pass quicker); keep riffling briefly while
    //    the server is still choosing, then hold the squared deck
    deck = await this.riffle(deck, 1);
    if (!this.alive(d)) return;
    deck = await this.riffle(deck, 0.62);
    for (let extra = 0; extra < 3 && this.alive(d) && !d.queue.length && !d.resolved; extra++) {
      deck = await this.riffle(deck, 0.62);
    }
    if (!this.alive(d)) return;
    await this.untilWoken(d);
    if (!this.alive(d)) return;

    // 3. deal face-down into the fan, one by one, with a toss arc toward the viewer
    const deal = d.queue.splice(0).sort((a, b) => a.slot - b.slot);
    for (let i = 0; i < deal.length; i++) {
      const e = deal[i];
      if (this.hand.get(e.key) !== e || e.mode !== "wait") continue;
      const g = ++e.gen;
      const own = this.findPile(e.key);
      if (own?.state === "deck") deck = deck.filter((c) => c !== own);
      this.takeFromPile(e.key);
      e.mode = "deal";
      e.faceUp = false;
      this.setLayer(e, 100 + i);
      const top = deck[deck.length - 1];
      e.body.set(
        top
          ? this.pilePose(0, 0, top.dk.rz, top.dk.h + 0.55, 180)
          : this.pilePose(0, 0, rand(-1.4, 1.4), 4, 180)
      );
      const sl = this.slotOf(e);
      this.placeHand(e, 95, 15);
      // Y is compensated so the lifted card doesn't dip under the draw button
      e.body.to(
        { Z: 170, Y: sl.y - this.liftComp(sl.y, 170) - 30, rz: sl.a + rand(-28, -14) * (e.slot < MID ? -1 : 1) },
        110,
        15
      );
      this.later(() => {
        if (e.gen !== g) return;
        e.body.to({ Z: 0, Y: sl.y, rz: sl.a }, 130, 15);
        this.setLayer(e, 100 + e.slot * 10);
      }, 230);
      await this.wait(DEAL_STEP);
      if (!this.alive(d)) return;
    }
    if (deal.length) await this.wait(260);
    if (!this.alive(d)) return;

    // 4. the rest of the deck is tossed back onto the table face-up — it's the pool again
    deck.forEach((c, i) => {
      c.state = "pile";
      this.scatter(c);
      this.later(() => {
        if (c.state !== "pile") return;
        this.placePile(c, rand(60, 95), rand(11, 14));
        this.nudge(c.body, { h: rand(300, 520) });
      }, i * 9);
    });
    await this.wait(200);
    if (!this.alive(d)) return;

    // 5. flip the new hand left → right, light sweep across each face
    for (const e of deal) {
      if (e.mode !== "deal") continue;
      this.flipUp(e);
      await this.wait(e.card.type === "person" ? 200 : 140);
      if (!this.alive(d)) return;
    }
    if (deal.length) await this.wait(350);
    for (const e of deal) this.toRest(e, e.gen);
    this.finishDraw(d);
  }

  private async riffle(deck: PileCard[], sp: number): Promise<PileCard[]> {
    const n = deck.length;
    const s = this.geo().s;
    if (n < 4) {
      deck.forEach((c, i) => {
        c.dk = { u: 0, v: 0, h: i * 0.55, rz: rand(-1, 1), ry: 180 };
        this.placePile(c, 260, 18);
        this.nudge(c.body, { h: 220 });
      });
      await this.wait(340 * sp);
      return deck;
    }
    // split into two halves, lifted, inner edges bent up
    const cut = Math.round(n / 2 + rand(-n * 0.08, n * 0.08));
    const A = deck.slice(0, cut);
    const B = deck.slice(cut);
    const off = this.L.W * s * 0.64;
    A.forEach((c, i) => {
      this.setLayer(c, 6000 + i);
      c.dk = { u: -off + rand(-2, 2), v: rand(-3, 3), h: 16 + i * 0.55, rz: -7 + rand(-1, 1), ry: 164 };
      this.placePile(c, 210, 22);
    });
    B.forEach((c, i) => {
      this.setLayer(c, 6000 + i);
      c.dk = { u: off + rand(-2, 2), v: rand(-3, 3), h: 16 + i * 0.55, rz: 7 + rand(-1, 1), ry: 196 };
      this.placePile(c, 210, 22);
    });
    await this.wait(270 * sp);
    // interleave from the bottom in small clumps, alternating sides
    const out: [PileCard, number][] = [];
    let a = 0;
    let b = 0;
    let side = Math.random() < 0.5;
    while (a < A.length || b < B.length) {
      const k = Math.random() < 0.72 ? 1 : 2;
      for (let j = 0; j < k; j++) {
        if (side && a < A.length) out.push([A[a++], -1]);
        else if (!side && b < B.length) out.push([B[b++], 1]);
      }
      side = !side;
      if (a >= A.length) side = false;
      if (b >= B.length) side = true;
    }
    const step = Math.min(22, 430 / n) * sp;
    out.forEach(([c, sd], i) =>
      this.later(() => {
        if (c.state !== "deck") return;
        this.setLayer(c, 5000 + i);
        c.dk = { u: sd * rand(4, 9), v: rand(-2, 2), h: i * 0.55 + 5, rz: sd * rand(1, 3.5), ry: 180 };
        this.placePile(c, 300, 23);
      }, i * step)
    );
    await this.wait(n * step + 150 * sp);
    // square up the deck (a little "tap" bounce)
    const res = out.map((x) => x[0]).filter((c) => c.state === "deck");
    res.forEach((c, i) => {
      this.setLayer(c, 5000 + i);
      c.dk = { u: 0, v: 0, h: i * 0.55, rz: rand(-1.4, 1.4), ry: 180 };
      this.placePile(c, 340, 21);
      this.nudge(c.body, { h: 120 });
    });
    await this.wait(220 * sp);
    return res;
  }
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

export function TabletopScene({
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
  const pileRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const feltRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<TabletopEngine | null>(null);
  const elsRef = useRef(new Map<string, HTMLDivElement>());

  const [dismissing, setDismissing] = useState<ReadonlySet<string>>(EMPTY_SET);
  const [prevHand, setPrevHand] = useState<HandSlot[] | null>(null);
  const [shown, setShown] = useState<Shown[]>([]);
  const [cardW, setCardW] = useState(150);
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
  // so the engine exists (and has a layout) when the first `syncEntries` runs
  // (a restored hand is present on the very first render).
  const reducedRef = useRef(reducedMotion);
  const insetsRef = useRef(insets);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const pileLayer = pileRef.current;
    const handLayer = handRef.current;
    const felt = feltRef.current;
    if (!root || !pileLayer || !handLayer || !felt) return;
    const engine = new TabletopEngine(root, pileLayer, handLayer, felt, handleDone);
    engineRef.current = engine;
    engine.setReduced(reducedRef.current);
    engine.setInsets(insetsRef.current.top, insetsRef.current.bottom);
    engine.resize();
    setCardW(engine.handWidth);
    const ro = new ResizeObserver(() => {
      engine.resize();
      setCardW(engine.handWidth);
    });
    ro.observe(root);
    const onVis = () => engine.visibility(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      engine.destroy();
      engineRef.current = null;
    };
  }, [handleDone]);

  useEffect(() => {
    reducedRef.current = reducedMotion;
    engineRef.current?.setReduced(reducedMotion);
  }, [reducedMotion]);

  useLayoutEffect(() => {
    insetsRef.current = insets;
    const engine = engineRef.current;
    if (!engine) return;
    engine.setInsets(insets.top, insets.bottom);
    setCardW(engine.handWidth);
  }, [insets]);

  useEffect(() => {
    engineRef.current?.syncPool(pool);
  }, [pool]);

  useLayoutEffect(() => {
    engineRef.current?.syncEntries(shown, elsRef.current);
  }, [shown]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const s of shown) if (!s.leaving) engine.setLocked(s.key, lockedKeys.has(s.key));
  }, [lockedKeys, shown]);

  // drawToken bump → gather + shuffle (the unlocked cards are already flying
  // back). Mounting mid-draw (theme switched while drawing) shuffles too.
  const lastToken = useRef<number | null>(null);
  useEffect(() => {
    const first = lastToken.current === null;
    if (drawToken === lastToken.current) return;
    lastToken.current = drawToken;
    if (!first || phase === "drawing") engineRef.current?.beginDraw();
    // phase is read only to catch a mid-draw mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawToken]);

  useEffect(() => {
    if (phase !== "drawing") engineRef.current?.drawResolved();
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
      <div aria-hidden className="rc-tt-lamp" />
      <div ref={pileRef} aria-hidden className="rc-tt-layer">
        <div ref={feltRef} className="rc-tt-felt">
          <i className="rc-tt-felt-glow" />
          <i className="rc-tt-felt-ring" />
        </div>
      </div>
      <div aria-hidden className="rc-vignette" />
      <div ref={handRef} className="rc-tt-layer">
        {shown.map((s) => {
          const locked = lockedKeys.has(s.key);
          const stale = staleKeys.has(s.key);
          const label = s.card.type === "movie" ? s.card.title : s.card.name;
          return (
            <div
              key={s.key}
              ref={(el) => registerEl(s.key, el)}
              className="rc-hc rc-card rc-tt-card rc-tt-hand"
              data-rc-card=""
              data-kind={s.card.type}
              data-locked={locked}
              data-stale={stale}
              role="button"
              tabIndex={s.leaving ? -1 : 0}
              aria-label={label}
              onPointerEnter={() => {
                if (s.leaving) return;
                engineRef.current?.hover(s.key, true);
                onHover(s.card);
              }}
              onPointerMove={(e) => {
                if (!s.leaving) engineRef.current?.tilt(s.key, e.clientX, e.clientY);
              }}
              onPointerLeave={() => {
                engineRef.current?.hover(s.key, false);
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
              <div className="rc-tt-shade" />
              <div className="rc-tt-flip">
                <div className="rc-hin rc-tt-front">
                  <HandCardFace
                    card={s.card}
                    locked={locked}
                    stale={stale}
                    width={cardW}
                    interactive={!busy && !s.leaving}
                    onToggleLock={onToggleLock}
                    onDismiss={handleDismiss}
                    onPlay={onPlay}
                  />
                  <div className="rc-tt-sweepbox">
                    <div className="rc-tt-sweep" />
                  </div>
                </div>
                <div className="rc-tt-face rc-tt-back" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Draw-lead: unlocked cards land back (≤ 440 + 5·60) + gather (≤ 360 + 320) +
// riffle (≈ 1070) + quicker riffle (≈ 660). Deal: per-card toss + settle +
// deck tossed back + left→right flips + a beat.
export const TABLETOP_SCENE: RecommendSceneDef = {
  id: "tabletop",
  Component: TabletopScene,
  drawLeadMs: 3100,
  dealMs: HAND_SIZE * DEAL_STEP + 260 + 200 + HAND_SIZE * FLIP_STEP + 350,
};

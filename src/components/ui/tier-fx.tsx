"use client";

import { useEffect, useRef } from "react";
import { getTier } from "@/lib/tier";
import "./tier-fx.css";

/**
 * Tier rarity FX — the card-face treatment for a personal-rating tier
 * (lib/tier.ts thresholds). Styles + rationale: tier-fx.css.
 *
 *   SSS  gold two-comet rim + bloom + breathing glow; faint inner-edge flow on hover
 *        (animated, glow kept soft at rest); 6 sparkles on hover only
 *   SS   orange one-comet rim + half bloom + soft glow   (animated)
 *   S    red static rim + glow
 *   A    purple static metallic rim (thinner) + faint glow
 *   B    blue static rim (thinner, no sheen) + fainter glow
 *   C and below, unrated, or `enabled === false` → renders nothing at all.
 *
 * Two parts, mounted by the card:
 * - `<TierFx>` — the frame. Put it as a sibling BEFORE the card's media box
 *   (inside whatever transforms with the card, e.g. TiltCard's children), so
 *   the rim / bloom / glow paint behind the opaque media and only show around
 *   its edge; sparkles lift above it via z-index.
 * - `<TierFxSurface>` — the in-media layer (SSS inner-edge flow). Put it
 *   inside the media box, right after the image and below the badges.
 * Pass the same `seed` (the item id) to both so the spin phase matches.
 *
 * Offscreen pause: one shared IntersectionObserver watches only animated
 * (SSS/SS) frames and flags the frame's parent with `data-tfx-off`.
 */

export type FxTier = "SSS" | "SS" | "S" | "A" | "B";

const TIER_CLASS: Record<FxTier, string> = {
  SSS: "tfx-sss",
  SS: "tfx-ss",
  S: "tfx-s",
  A: "tfx-a",
  B: "tfx-b",
};

/** The FX tier for a personal rating, or null when no effect applies. */
export function tierFxOf(rating: number | null | undefined, enabled = true): FxTier | null {
  if (!enabled || rating == null || !(rating > 0)) return null;
  const tier = getTier(rating);
  return tier in TIER_CLASS ? (tier as FxTier) : null;
}

// SSS sparkle layout (% of the card box, px size at intensity 1, delay s).
const SPARKS = [
  { l: 22, t: 1, s: 10, d: 0 },
  { l: 97, t: 14, s: 8, d: 1.3 },
  { l: 99, t: 58, s: 7, d: 2.5 },
  { l: 1, t: 70, s: 9, d: 3.2 },
  { l: 72, t: 99, s: 9, d: 0.7 },
  { l: 30, t: 88, s: 6, d: 1.9 },
];
// 标准 intensity: sparkle size ×1.35; delays stretched to spread the 6 glints
// across the slow 7s twinkle cycle (user feedback: slower + sparser).
const SPARK_SIZE = 1.35;
const SPARK_TIME = 2;

/** Stable 0..1 hash so a card's spin phase survives re-renders + SSR. */
function phase(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function phaseVars(seed: string, radius: string | undefined): React.CSSProperties {
  return {
    "--tfx-ph": `${(-phase(seed, 1) * 8).toFixed(2)}s`,
    ...(radius ? { "--tfx-r": radius } : {}),
  } as React.CSSProperties;
}

// ── shared offscreen pause ────────────────────────────────────────────────
let io: IntersectionObserver | null = null;
const hosts = new WeakMap<Element, HTMLElement>();

function observeOffscreen(el: HTMLElement): () => void {
  const host = el.parentElement;
  if (!host || typeof IntersectionObserver === "undefined") return () => {};
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const h = hosts.get(e.target);
          if (!h) continue;
          if (e.isIntersecting) h.removeAttribute("data-tfx-off");
          else h.setAttribute("data-tfx-off", "");
        }
      },
      { rootMargin: "120px" }
    );
  }
  hosts.set(el, host);
  io.observe(el);
  return () => {
    io?.unobserve(el);
    hosts.delete(el);
    host.removeAttribute("data-tfx-off");
  };
}

interface TierFxProps {
  /** Personal rating (0–10); ≤ 0 / null → no effect. */
  rating: number | null | undefined;
  /** The user's `showTierEffects` pref (or a preview's local toggle). */
  enabled: boolean;
  /** Item id — seeds the rim spin phase so a grid doesn't pulse in sync. */
  seed?: string;
  /** Corner radius of the media box (CSS length). Default 0.375rem (rounded-md). */
  radius?: string;
}

/** Frame layers (glow, bloom, rim, sparkles) — sibling before the media. */
export function TierFx({ rating, enabled, seed = "", radius }: TierFxProps) {
  const tier = tierFxOf(rating, enabled);
  const ref = useRef<HTMLDivElement>(null);
  const animated = tier === "SSS" || tier === "SS";

  useEffect(() => {
    const el = ref.current;
    if (!animated || !el) return;
    return observeOffscreen(el);
  }, [animated]);

  if (!tier) return null;
  const cls = `tfx ${TIER_CLASS[tier]}`;
  const style = phaseVars(seed, radius);

  if (tier === "S" || tier === "A" || tier === "B") {
    return (
      <div aria-hidden className={cls} style={style}>
        <div className="tfx-glow" />
        <div className="tfx-rim tfx-rim-static" />
      </div>
    );
  }

  return (
    <div ref={ref} aria-hidden className={cls} style={style}>
      <div className="tfx-glow tfx-anim" />
      <div className="tfx-bloom">
        <i className="tfx-spin tfx-anim" />
      </div>
      <div className="tfx-rim tfx-rim-flow">
        <i className="tfx-spin tfx-anim" />
      </div>
      {tier === "SSS" && (
        <div className="tfx-sparkles">
          {SPARKS.map((s, i) => (
            <span
              key={i}
              style={
                {
                  "--l": `${s.l}%`,
                  "--t": `${s.t}%`,
                  "--s": `${(s.s * SPARK_SIZE) / 16}rem`,
                  "--d": `${(s.d * SPARK_TIME).toFixed(3)}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** In-media layer (SSS inner-edge flow) — inside the media box. */
export function TierFxSurface({ rating, enabled, seed = "", radius }: TierFxProps) {
  if (tierFxOf(rating, enabled) !== "SSS") return null;
  return (
    <div aria-hidden className="tfx-surface tfx-sss" style={phaseVars(seed, radius)}>
      <div className="tfx-inner">
        <i className="tfx-spin tfx-anim" />
      </div>
    </div>
  );
}

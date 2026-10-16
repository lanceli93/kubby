"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * TiltCard — reusable Apple-TV-style 3D pointer-tilt primitive.
 *
 * Wraps children in a perspective container; an inner element rotates toward the
 * pointer (rotateX/rotateY, capped at `maxTilt`) and paints a radial glare that
 * follows the cursor. Children lift with `translateZ` by adding the `.tilt-lift`
 * utility class (or reading the exposed `--tilt-lift` distance) — see globals.css.
 *
 * Motion: the rotation is a damped spring — each pointer move sets a target and
 * a self-terminating rAF loop integrates toward it. While hovered the spring is
 * stiff and ~critically damped (tracks the pointer briskly, no wobble); on leave
 * it switches to a soft, under-damped spring (ζ≈0.7), so the card drifts back to
 * flat over ~0.5s with a hint of overshoot instead of snapping. The glare/rim
 * position lerps (τ 90ms). Applied via direct ref DOM mutation (transform + CSS
 * custom props), never React state, so hovering never re-renders the child tree.
 *
 * Light: a glare that brightens the pointer side and faintly shades the far
 * corner (contrast, not a milky white wash), plus a 1px rim light on the edge
 * nearest the pointer (`.tilt-rim`, globals.css). Lift: a soft drop shadow (flat
 * sibling, opt out with `shadow={false}`) fades in under the card and slides away
 * from the edge that tilts toward the viewer.
 *
 * Ambient glow: pass `glow` (an image URL — usually the tiny blurred placeholder)
 * and TiltCard paints the hover ambilight behind the card. It lives OUTSIDE the
 * tilting subtree (a flat sibling, so its blur isn't flattened by preserve-3d) but
 * still reacts to the tilt: the loop publishes the normalized tilt as
 * `--tilt-nx` / `--tilt-ny` (−1..1) on the wrapper and the glow drifts away from
 * the pointer, spilling out from under the edge that lifts toward the viewer.
 *
 * Degradation: no tilt/glare on coarse pointers (touch) or when the user prefers
 * reduced motion — in those cases (and when `disabled`) children render unchanged
 * and flat, preserving current behavior.
 *
 * CAUTION: `preserve-3d` breaks `backdrop-filter` on descendants in some Chromium
 * versions. Overlays placed inside the tilting subtree (hover bars, scrims) must
 * NOT rely on `backdrop-blur` — use an opaque or gradient background instead.
 */
interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Max rotation in degrees on each axis. Default 6. */
  maxTilt?: number;
  /** Freeze flat and skip all pointer handling (e.g. while a menu is open). */
  disabled?: boolean;
  /** Image URL for the hover ambient glow behind the card; omit for none. */
  glow?: string | null;
  /** Keep the glow lit without hover (e.g. while the card's menu is open). */
  glowActive?: boolean;
  /** Extra classes for the glow layer (e.g. `rounded-full` for round cards). */
  glowClassName?: string;
  /** Corner radius class matching the child's frame (glare/rim/shadow follow it). */
  rounded?: string;
  /** Hover drop shadow under the card. Default true. */
  shadow?: boolean;
}

// Glare/rim position lerp time constant (ms): eases at 1 - exp(-dt/TAU).
const TAU = 90;
// Rotation springs (stiffness k, damping c; unit mass, seconds).
// Tracking: ζ = c / 2√k ≈ 1 — brisk, no wobble. Release: ζ ≈ 0.7 — slow and soft
// with a small overshoot. Keep ζ ≥ ~0.7 or the settle reads as a toy bounce.
const SPRING_TRACK = { k: 170, c: 26 };
const SPRING_RELEASE = { k: 60, c: 11 };
// Integration step cap (s) so a dropped frame / background tab can't blow it up.
const MAX_DT = 1 / 30;
// How far (px) the ambient glow drifts at full tilt.
const GLOW_SHIFT = 16;
// How far (px) the drop shadow slides away from the lifted edge at full tilt.
const SHADOW_SHIFT = 6;

interface TiltState {
  rx: number; // rotateX (deg)
  ry: number; // rotateY (deg)
  gx: number; // glare x (%)
  gy: number; // glare y (%)
}

export function TiltCard({
  children,
  className,
  maxTilt = 6,
  disabled,
  glow,
  glowActive,
  glowClassName,
  rounded = "rounded-md",
  shadow = true,
}: TiltCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const glowLayerRef = useRef<HTMLDivElement>(null);
  const shadowLayerRef = useRef<HTMLDivElement>(null);
  // Where the tilt is heading vs. where it currently sits; the loop moves one
  // toward the other and writes `current` to the DOM.
  const targetRef = useRef<TiltState>({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const currentRef = useRef<TiltState>({ rx: 0, ry: 0, gx: 50, gy: 50 });
  // Rotation velocity (deg/s) for the spring integrator.
  const velRef = useRef({ rx: 0, ry: 0 });
  // Pointer is over the card → stiff tracking spring; else soft release spring.
  const hoveringRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  // Whether interactive tilt is allowed (fine pointer + motion not reduced).
  const enabledRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      enabledRef.current = fine.matches && !reduce.matches;
    };
    update();
    fine.addEventListener("change", update);
    reduce.addEventListener("change", update);
    return () => {
      fine.removeEventListener("change", update);
      reduce.removeEventListener("change", update);
    };
  }, []);

  // Toggle compositor-layer hints on the tilting element and its flat siblings.
  const setLayerHints = (value: string) => {
    if (tiltRef.current) tiltRef.current.style.willChange = value;
    if (glowLayerRef.current) glowLayerRef.current.style.willChange = value;
    if (shadowLayerRef.current) shadowLayerRef.current.style.willChange = value;
  };

  // Spring/lerp toward target; self-terminates once everything settles.
  const tick = (ts: number) => {
    const el = tiltRef.current;
    if (!el) {
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }
    // Promote to its own compositor layer only while the loop is live; cleared
    // below the instant it settles (see the `settled` branch), so idle cards
    // never hold a GPU layer.
    setLayerHints("transform");
    const last = lastTsRef.current ?? ts;
    const dtMs = ts - last;
    lastTsRef.current = ts;
    const dt = Math.min(dtMs / 1000, MAX_DT);
    const target = targetRef.current;
    const cur = currentRef.current;
    const vel = velRef.current;
    // Semi-implicit Euler spring step on each rotation axis.
    const { k: sk, c: sc } = hoveringRef.current ? SPRING_TRACK : SPRING_RELEASE;
    vel.rx += (sk * (target.rx - cur.rx) - sc * vel.rx) * dt;
    vel.ry += (sk * (target.ry - cur.ry) - sc * vel.ry) * dt;
    cur.rx += vel.rx * dt;
    cur.ry += vel.ry * dt;
    const k = 1 - Math.exp(-dtMs / TAU);
    cur.gx += (target.gx - cur.gx) * k;
    cur.gy += (target.gy - cur.gy) * k;
    // Snap and stop once the residual (and spring velocity) is imperceptible.
    const settled =
      Math.abs(target.rx - cur.rx) < 0.02 &&
      Math.abs(target.ry - cur.ry) < 0.02 &&
      Math.abs(vel.rx) < 0.05 &&
      Math.abs(vel.ry) < 0.05 &&
      Math.abs(target.gx - cur.gx) < 0.1 &&
      Math.abs(target.gy - cur.gy) < 0.1;
    if (settled) {
      cur.rx = target.rx;
      cur.ry = target.ry;
      cur.gx = target.gx;
      cur.gy = target.gy;
      vel.rx = 0;
      vel.ry = 0;
    }
    el.style.transform = `rotateX(${cur.rx}deg) rotateY(${cur.ry}deg)`;
    // Glare + rim read these from the tilting element (inherited).
    el.style.setProperty("--glare-x", `${cur.gx}%`);
    el.style.setProperty("--glare-y", `${cur.gy}%`);
    const root = rootRef.current;
    if (root && maxTilt > 0) {
      root.style.setProperty("--tilt-nx", `${cur.ry / maxTilt}`);
      root.style.setProperty("--tilt-ny", `${-cur.rx / maxTilt}`);
    }
    if (settled) {
      // Settle-back is done (this also fires after pointerleave, once the
      // ease-to-flat finishes) — release the compositor layers.
      setLayerHints("");
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const startLoop = () => {
    if (rafRef.current == null) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !enabledRef.current) return;
    const el = tiltRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    hoveringRef.current = true;
    // Normalized pointer position within the card: 0..1 on each axis.
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    // Center → 0, edges → ±maxTilt. Positive Y (below center) tilts the top back.
    targetRef.current = {
      rx: -(py - 0.5) * 2 * maxTilt,
      ry: (px - 0.5) * 2 * maxTilt,
      gx: px * 100,
      gy: py * 100,
    };
    startLoop();
  };

  // Ease back to flat on the soft release spring; glare position stays put (its
  // opacity is CSS-driven).
  const resetTilt = () => {
    hoveringRef.current = false;
    targetRef.current = { ...targetRef.current, rx: 0, ry: 0 };
    startLoop();
  };

  // Freeze flat whenever tilt is disabled (e.g. dropdown menu open).
  useEffect(() => {
    if (disabled) resetTilt();
  }, [disabled]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      // If we unmount mid-animation the node is torn down anyway, but clear the
      // hint defensively so no layer is ever left dangling.
      setLayerHints("");
    };
  }, []);

  // Promote the layer up front on entry so the very first tilt frame composites
  // cleanly; the rAF loop clears it again once motion settles.
  const handlePointerEnter = () => {
    if (disabled || !enabledRef.current) return;
    const el = tiltRef.current;
    if (el) el.style.willChange = "transform";
  };

  return (
    <div
      ref={rootRef}
      className={cn("group/tilt relative [perspective:900px]", className)}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
    >
      {/* Lift shadow — flat sibling under everything (like the glow, outside the
          preserve-3d subtree). Fades in on hover and slides away from the edge
          that tilts toward the viewer; opacity-only transition for the same
          reason as the glow. Stacked layers read as one soft light source. */}
      {shadow && (
        <div
          ref={shadowLayerRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300 ease-out",
            glowActive ? "opacity-100" : "opacity-0 group-hover/tilt:opacity-100",
            rounded,
          )}
          style={{
            boxShadow:
              "0 0.25rem 0.5rem rgb(0 0 0 / 0.22), 0 0.75rem 1.5rem rgb(0 0 0 / 0.28), 0 1.5rem 3rem rgb(0 0 0 / 0.32)",
            transform: `translate(calc(var(--tilt-nx, 0) * ${-SHADOW_SHIFT}px), calc(0.375rem + var(--tilt-ny, 0) * ${-SHADOW_SHIFT}px))`,
          }}
        />
      )}
      {/* Ambient glow (ambilight) — blurred image bleeding behind, hover-only.
          Its offset tracks --tilt-nx/ny, which the rAF loop writes every frame,
          so it must not transition `transform`: that would chase each frame's
          value and smear the motion. The individual `scale` property is separate
          from `transform`, so it can ease the glow up as the card "rises". */}
      {glow && (
        <div
          ref={glowLayerRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 rounded-md bg-cover bg-center blur-[24px] saturate-150 transition-[opacity,scale] duration-300 ease-out",
            glowActive
              ? "opacity-55"
              : "scale-[0.94] opacity-0 group-hover:scale-100 group-hover:opacity-55",
            glowClassName,
          )}
          style={{
            backgroundImage: `url("${glow}")`,
            transform: `translate(calc(var(--tilt-nx, 0) * ${-GLOW_SHIFT}px), calc(var(--tilt-ny, 0) * ${-GLOW_SHIFT}px)) scale(1.1)`,
          }}
        />
      )}
      <div
        ref={tiltRef}
        className={cn("relative h-full w-full [transform-style:preserve-3d]", rounded)}
      >
        {children}
        {/* Glare — rides above the poster, ignores pointer, fades in on hover.
            Brightens the pointer side and faintly shades the far corner, so it
            reads as light raking across a print rather than a white wash. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[6] rounded-[inherit] opacity-0 transition-opacity duration-300 ease-out group-hover/tilt:opacity-100 [background:radial-gradient(farthest-corner_circle_at_var(--glare-x,50%)_var(--glare-y,50%),rgb(255_255_255/0.13),rgb(255_255_255/0.04)_30%,transparent_55%,rgb(0_0_0/0.22))]"
        />
        {/* Rim light — 1px edge highlight nearest the pointer (globals.css). */}
        <div
          aria-hidden
          className="tilt-rim pointer-events-none absolute inset-0 z-[9] rounded-[inherit] opacity-0 transition-opacity duration-300 ease-out group-hover/tilt:opacity-100"
        />
      </div>
    </div>
  );
}

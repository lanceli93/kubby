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
 * Motion: the tilt is critically-damped — each pointer move sets a target and a
 * self-terminating rAF loop lerps the current rotation/glare toward it (τ 90ms,
 * framerate-independent), so a fast entry eases in instead of snapping. Applied
 * via direct ref DOM mutation (transform + CSS custom props), never React state,
 * so hovering never re-renders the child tree.
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
}

// Damping time constant (ms): current eases toward target at 1 - exp(-dt/TAU).
const TAU = 90;
// How far (px) the ambient glow drifts at full tilt.
const GLOW_SHIFT = 16;

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
}: TiltCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const glowLayerRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  // Where the tilt is heading vs. where it currently sits; the loop lerps one
  // toward the other and writes `current` to the DOM.
  const targetRef = useRef<TiltState>({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const currentRef = useRef<TiltState>({ rx: 0, ry: 0, gx: 50, gy: 50 });
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

  // Time-based lerp toward target; self-terminates once everything settles.
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
    el.style.willChange = "transform";
    if (glowLayerRef.current) glowLayerRef.current.style.willChange = "transform";
    const last = lastTsRef.current ?? ts;
    const dt = ts - last;
    lastTsRef.current = ts;
    const k = 1 - Math.exp(-dt / TAU);
    const target = targetRef.current;
    const cur = currentRef.current;
    cur.rx += (target.rx - cur.rx) * k;
    cur.ry += (target.ry - cur.ry) * k;
    cur.gx += (target.gx - cur.gx) * k;
    cur.gy += (target.gy - cur.gy) * k;
    // Snap and stop once the residual is imperceptible.
    const settled =
      Math.abs(target.rx - cur.rx) < 0.02 &&
      Math.abs(target.ry - cur.ry) < 0.02 &&
      Math.abs(target.gx - cur.gx) < 0.1 &&
      Math.abs(target.gy - cur.gy) < 0.1;
    if (settled) {
      cur.rx = target.rx;
      cur.ry = target.ry;
      cur.gx = target.gx;
      cur.gy = target.gy;
    }
    el.style.transform = `rotateX(${cur.rx}deg) rotateY(${cur.ry}deg)`;
    const root = rootRef.current;
    if (root && maxTilt > 0) {
      root.style.setProperty("--tilt-nx", `${cur.ry / maxTilt}`);
      root.style.setProperty("--tilt-ny", `${-cur.rx / maxTilt}`);
    }
    const glare = glareRef.current;
    if (glare) {
      glare.style.setProperty("--glare-x", `${cur.gx}%`);
      glare.style.setProperty("--glare-y", `${cur.gy}%`);
    }
    if (settled) {
      // Settle-back is done (this also fires after pointerleave, once the
      // ease-to-flat finishes) — release the compositor layer.
      el.style.willChange = "";
      if (glowLayerRef.current) glowLayerRef.current.style.willChange = "";
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

  // Ease back to flat; glare position stays put (its opacity is CSS-driven).
  const resetTilt = () => {
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
      if (tiltRef.current) tiltRef.current.style.willChange = "";
      if (glowLayerRef.current) glowLayerRef.current.style.willChange = "";
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
      {/* Ambient glow (ambilight) — blurred image bleeding behind, hover-only.
          Its offset tracks --tilt-nx/ny, which the rAF loop writes every frame,
          so it must transition opacity ONLY: a transform transition would chase
          each frame's value and smear the motion. */}
      {glow && (
        <div
          ref={glowLayerRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 rounded-md bg-cover bg-center blur-[24px] saturate-150 transition-opacity duration-300 ease-out",
            glowActive ? "opacity-55" : "opacity-0 group-hover:opacity-55",
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
        className="relative h-full w-full [transform-style:preserve-3d]"
      >
        {children}
        {/* Glare — rides above the poster, ignores pointer, fades in on hover. */}
        <div
          ref={glareRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[6] rounded-[inherit] opacity-0 transition-opacity duration-300 ease-out group-hover/tilt:opacity-100 [background:radial-gradient(circle_at_var(--glare-x,50%)_var(--glare-y,50%),rgba(255,255,255,0.18),transparent_55%)]"
        />
      </div>
    </div>
  );
}

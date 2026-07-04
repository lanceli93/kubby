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
 * Performance: pointer moves are rAF-throttled and applied via direct ref DOM
 * mutation (transform + CSS custom props), never React state, so hovering never
 * re-renders the child tree.
 *
 * Degradation: no tilt/glare on coarse pointers (touch) or when the user prefers
 * reduced motion — in those cases (and when `disabled`) children render unchanged
 * and flat, preserving current behavior.
 *
 * CAUTION: `preserve-3d` breaks `backdrop-filter` on descendants in some Chromium
 * versions. Keep blur bars OUTSIDE the tilting subtree (place them as siblings of
 * TiltCard, or absolutely positioned relative to the outer group), not inside it.
 */
interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Max rotation in degrees on each axis. Default 6. */
  maxTilt?: number;
  /** Freeze flat and skip all pointer handling (e.g. while a menu is open). */
  disabled?: boolean;
}

// Apple-like overshoot curve, matching `.transition-fluid` in globals.css.
const RESET_TRANSITION = "transform 350ms cubic-bezier(0.22, 1, 0.36, 1)";

export function TiltCard({ children, className, maxTilt = 6, disabled }: TiltCardProps) {
  const tiltRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);
  // Latest pointer event, consumed by a single scheduled rAF.
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
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

  const applyFrame = () => {
    rafRef.current = null;
    const el = tiltRef.current;
    const pending = pendingRef.current;
    if (!el || !pending) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Normalized pointer position within the card: 0..1 on each axis.
    const px = (pending.x - rect.left) / rect.width;
    const py = (pending.y - rect.top) / rect.height;
    // Center → 0, edges → ±maxTilt. Positive Y (below center) tilts the top back.
    const rotateY = (px - 0.5) * 2 * maxTilt;
    const rotateX = -(py - 0.5) * 2 * maxTilt;
    el.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    const glare = glareRef.current;
    if (glare) {
      glare.style.setProperty("--glare-x", `${px * 100}%`);
      glare.style.setProperty("--glare-y", `${py * 100}%`);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !enabledRef.current) return;
    pendingRef.current = { x: e.clientX, y: e.clientY };
    const el = tiltRef.current;
    if (el) el.style.transition = "none"; // track cursor without lag
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(applyFrame);
    }
  };

  const resetTilt = () => {
    pendingRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const el = tiltRef.current;
    if (el) {
      el.style.transition = RESET_TRANSITION;
      el.style.transform = "";
    }
  };

  // Freeze flat whenever tilt is disabled (e.g. dropdown menu open).
  useEffect(() => {
    if (disabled) resetTilt();
  }, [disabled]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      className={cn("group/tilt relative [perspective:900px]", className)}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
    >
      <div
        ref={tiltRef}
        className="relative h-full w-full [transform-style:preserve-3d] will-change-transform"
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

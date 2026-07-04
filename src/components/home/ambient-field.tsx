"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { extractAmbientColor } from "@/lib/ambient-color";

/**
 * Ambient "ambilight" field for the home page.
 *
 * A layer of large, soft radial glows sits behind the content. Its color eases
 * — slowly, cinematically — toward whichever poster the user is hovering (the
 * tint is sampled from that movie's tiny `posterBlur` placeholder). When the
 * pointer leaves, the glow drifts back to the indigo-derived base. Think of the
 * projector light in a dark cinema taking on the color of the frame on screen.
 *
 * Motion follows the repo's TiltCard idiom: a target RGB is set imperatively and
 * a self-terminating rAF loop eases the current color toward it (framerate-
 * independent, τ ≈ 600ms), writing the result to a CSS custom property via a ref
 * — never React state, so hovering never re-renders the page. The loop stops
 * once the color settles. A very slow CSS "breathing" opacity pulse gives the
 * static field some life. Reduced motion snaps colors instantly and disables the
 * breathe animation.
 */

type RGB = [number, number, number];

// Base color = indigo primary (#6366f1) darkened toward the background, so an
// idle home page still glows faintly indigo instead of going flat black.
const BASE_COLOR: RGB = [40, 42, 90];

// Easing time constant (ms). Long → slow, dreamy color drift.
const TAU = 600;
// Per-channel residual below which we snap and stop the loop.
const SETTLE_EPSILON = 0.5;
// Hover dwell before we commit to retargeting, so skimming a row of posters
// doesn't strobe the glow through a dozen hues.
const HOVER_DELAY_MS = 120;

interface AmbientApi {
  /** Ease the glow toward `rgb`, or back to the base color when `null`. */
  setTarget: (rgb: RGB | null) => void;
  /** Change the resting/base color the glow reverts to (e.g. from the hero). */
  setBase: (rgb: RGB) => void;
}

const noop: AmbientApi = {
  setTarget: () => {},
  setBase: () => {},
};

const AmbientContext = createContext<AmbientApi>(noop);

/** Safe anywhere — returns no-ops when rendered outside an `AmbientProvider`. */
export function useAmbient(): AmbientApi {
  return useContext(AmbientContext);
}

interface AmbientProviderProps {
  children: ReactNode;
}

/**
 * Holds the imperative color state and drives the rAF easing loop. `AmbientField`
 * (rendered anywhere below this provider) reads the animated color via a shared
 * ref that this provider mutates. Children render as-is.
 */
export function AmbientProvider({ children }: AmbientProviderProps) {
  // The element carrying the `--ambient` CSS variable (registered by AmbientField).
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<RGB>([...BASE_COLOR] as RGB);
  const targetRef = useRef<RGB>([...BASE_COLOR] as RGB);
  const currentRef = useRef<RGB>([...BASE_COLOR] as RGB);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const reduceRef = useRef(false);

  const write = useCallback(() => {
    const el = fieldRef.current;
    if (!el) return;
    const [r, g, b] = currentRef.current;
    el.style.setProperty(
      "--ambient",
      `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`
    );
  }, []);

  const tick = useCallback(
    (ts: number) => {
      const last = lastTsRef.current ?? ts;
      const dt = ts - last;
      lastTsRef.current = ts;
      const k = 1 - Math.exp(-dt / TAU);
      const target = targetRef.current;
      const cur = currentRef.current;
      let settled = true;
      for (let i = 0; i < 3; i++) {
        cur[i] += (target[i] - cur[i]) * k;
        if (Math.abs(target[i] - cur[i]) >= SETTLE_EPSILON) settled = false;
      }
      if (settled) {
        cur[0] = target[0];
        cur[1] = target[1];
        cur[2] = target[2];
      }
      write();
      if (settled) {
        rafRef.current = null;
        lastTsRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [write]
  );

  const startLoop = useCallback(() => {
    // Reduced motion: skip easing, snap straight to target.
    if (reduceRef.current) {
      currentRef.current = [...targetRef.current] as RGB;
      write();
      return;
    }
    if (rafRef.current == null) {
      lastTsRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick, write]);

  const setTarget = useCallback(
    (rgb: RGB | null) => {
      targetRef.current = rgb ? ([...rgb] as RGB) : ([...baseRef.current] as RGB);
      startLoop();
    },
    [startLoop]
  );

  const setBase = useCallback(
    (rgb: RGB) => {
      baseRef.current = [...rgb] as RGB;
      // If we're currently resting at the base (no poster hovered), drift to the
      // new base too. Heuristic: only chase if the target still equals the old
      // base — i.e. nothing is actively hovered.
      targetRef.current = [...rgb] as RGB;
      startLoop();
    },
    [startLoop]
  );

  // Track reduced-motion preference for snap-vs-ease.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reduceRef.current = reduce.matches;
    };
    update();
    reduce.addEventListener("change", update);
    return () => reduce.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const api = useMemo<AmbientApi & { fieldRef: typeof fieldRef }>(
    () => ({ setTarget, setBase, fieldRef }),
    [setTarget, setBase]
  );

  return <AmbientContext.Provider value={api}>{children}</AmbientContext.Provider>;
}

// Internal channel: AmbientField needs the provider's fieldRef to register the
// element that carries `--ambient`. We piggyback it on the context value.
function useAmbientFieldRef() {
  const ctx = useContext(AmbientContext) as AmbientApi & {
    fieldRef?: React.MutableRefObject<HTMLDivElement | null>;
  };
  return ctx.fieldRef;
}

interface AmbientFieldProps {
  className?: string;
}

/**
 * The visual glow layer. Place as the first child of the page's `relative`
 * scroll container. `aria-hidden`, non-interactive, pinned behind content.
 * Colors are driven entirely by the `--ambient` CSS variable that the provider
 * mutates, so this component itself never re-renders during animation.
 */
export function AmbientField({ className }: AmbientFieldProps) {
  const fieldRef = useAmbientFieldRef();
  const localRef = useRef<HTMLDivElement>(null);

  // Register our root element with the provider so its rAF loop can write
  // `--ambient` onto it. Seed the variable so blobs have a color on first paint.
  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.style.setProperty(
      "--ambient",
      `${BASE_COLOR[0]} ${BASE_COLOR[1]} ${BASE_COLOR[2]}`
    );
    if (fieldRef) fieldRef.current = el;
    return () => {
      if (fieldRef && fieldRef.current === el) fieldRef.current = null;
    };
  }, [fieldRef]);

  return (
    <div
      ref={localRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden",
        className
      )}
    >
      {/* Breathing wrapper — one slow shared opacity pulse over the whole field. */}
      <div className="absolute inset-0 animate-ambient-breathe motion-reduce:animate-none">
        {/* Top-left dominant glow. */}
        <div
          className="absolute rounded-full"
          style={{
            top: "-20%",
            left: "-10%",
            width: "70vw",
            height: "70vw",
            filter: "blur(80px)",
            opacity: 0.16,
            background: "rgb(var(--ambient) / 1)",
          }}
        />
        {/* Right glow. */}
        <div
          className="absolute rounded-full"
          style={{
            top: "-10%",
            right: "-5%",
            width: "50vw",
            height: "50vw",
            filter: "blur(80px)",
            opacity: 0.13,
            background: "rgb(var(--ambient) / 1)",
          }}
        />
        {/* Faint bottom-left glow. */}
        <div
          className="absolute rounded-full"
          style={{
            bottom: "-25%",
            left: "5%",
            width: "45vw",
            height: "45vw",
            filter: "blur(80px)",
            opacity: 0.1,
            background: "rgb(var(--ambient) / 1)",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Pointer handlers that retarget the ambient glow to a poster's tint on enter
 * (after a short dwell) and revert on leave. Attach to whatever element wraps a
 * card. Safe outside a provider (setTarget is a no-op there).
 *
 * @example
 *   const hover = useAmbientHover(movie.posterBlur);
 *   <div className="flex-shrink-0" {...hover}><MovieCard … /></div>
 */
export function useAmbientHover(posterBlur?: string | null) {
  const { setTarget } = useAmbient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a late color decode landing after the pointer already left.
  const insideRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onMouseEnter = useCallback(() => {
    insideRef.current = true;
    clearTimer();
    if (!posterBlur) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      extractAmbientColor(posterBlur).then((rgb) => {
        if (rgb && insideRef.current) setTarget(rgb);
      });
    }, HOVER_DELAY_MS);
  }, [posterBlur, setTarget, clearTimer]);

  const onMouseLeave = useCallback(() => {
    insideRef.current = false;
    clearTimer();
    setTarget(null);
  }, [setTarget, clearTimer]);

  // Cancel any pending timer if the host unmounts mid-dwell.
  useEffect(() => clearTimer, [clearTimer]);

  return { onMouseEnter, onMouseLeave };
}

interface AmbientHoverZoneProps {
  posterBlur?: string | null;
  children: ReactNode;
  /**
   * Class for the wrapper. Because the wrapper is a real element (needed to
   * receive pointer events — `display:contents` swallows them), callers should
   * pass the flex-item class the card would otherwise carry (e.g.
   * `"flex-shrink-0"`) so layout is unaffected.
   */
  className?: string;
}

/**
 * A real wrapper element that retargets the ambient glow while hovered. Prefer
 * `useAmbientHover` when you can spread handlers onto an existing wrapper; use
 * this when you just want to drop a card inside a hover zone.
 */
export function AmbientHoverZone({
  posterBlur,
  children,
  className,
}: AmbientHoverZoneProps) {
  const handlers = useAmbientHover(posterBlur);
  return (
    <div className={className} {...handlers}>
      {children}
    </div>
  );
}

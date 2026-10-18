"use client";

import { useImperativeHandle, useRef, type Ref } from "react";

/**
 * Blurred fanart of the hovered / focused card, crossfading behind the scene
 * (two layers, ping-pong). Imperative so hovering never re-renders the page.
 * Kept faint (opacity .2 + heavy blur) and under the scene's vignette so text
 * on the cards stays legible over bright fanart.
 */
export interface AmbientBackdropHandle {
  show: (src: string | null) => void;
}

export function AmbientBackdrop({ ref }: { ref: Ref<AmbientBackdropHandle> }) {
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  const state = useRef({ i: 0, src: "" });

  useImperativeHandle(
    ref,
    () => ({
      show(src) {
        const s = state.current;
        if (!src || src === s.src) return;
        const layers = [aRef.current, bRef.current];
        if (!layers[0] || !layers[1]) return;
        s.src = src;
        s.i ^= 1;
        const on = layers[s.i]!;
        const off = layers[s.i ^ 1]!;
        on.style.backgroundImage = `url("${src}")`;
        on.dataset.on = "true";
        off.dataset.on = "false";
      },
    }),
    []
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={aRef} className="rc-amb" data-on="false" />
      <div ref={bRef} className="rc-amb" data-on="false" />
    </div>
  );
}

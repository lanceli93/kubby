/**
 * Shared-element View Transition for the poster morph (card → detail page).
 *
 * Clicking a movie card should make its poster fly/grow into the large poster
 * on `/movies/[id]` (Apple-TV-style spatial zoom). We hand-roll this on top of
 * the native `document.startViewTransition` API rather than relying on React's
 * `unstable_ViewTransition` (not exported by stable React 19.2.3) or Next's
 * `experimental.viewTransition` flag (inert in Next 16.1.6 — schema-only, not
 * wired into the App Router). Hand-rolling also gives us the per-element name
 * assignment needed to avoid duplicate `view-transition-name` collisions.
 *
 * ── The uniqueness constraint ─────────────────────────────
 * The same movie can appear in several rows at once (Continue Watching + library
 * rows on home, "recommended" rows on the detail page). Two elements sharing a
 * `view-transition-name` in one document make the browser SKIP the whole
 * transition. So we never statically name any poster: the clicked poster gets
 * `view-transition-name: movie-poster` inline at click time, the detail page's
 * large poster carries the same name statically, and only ever one element holds
 * it in a given document — the name is stripped again once the transition ends.
 *
 * ── The "new page painted" timing problem ─────────────────
 * `router.push()` resolving does NOT mean the target poster is in the DOM: the
 * detail page fetches its data via React Query, so the poster mounts hundreds of
 * ms after navigation. `document.startViewTransition(cb)` captures the OLD
 * snapshot synchronously BEFORE running `cb`, then captures the NEW snapshot only
 * once the promise returned by `cb` resolves. We therefore return a promise that
 * resolves after the detail poster has mounted AND painted, so the browser reads
 * geometry from the fully-rendered new poster — not the empty intermediate DOM.
 * A timeout guarantees the promise always settles (mobile, fetch errors, etc.).
 */

const POSTER_VT_NAME = "movie-poster";

/** Marks the detail page's large poster as the morph target (data attribute). */
export const POSTER_VT_ATTR = "data-vt-poster";

/**
 * Assign the shared name to the clicked poster and start a View Transition that
 * stays open until the detail poster is on screen, then navigate.
 *
 * Falls back to an instant `push` (behaviour identical to today) when the View
 * Transitions API is unavailable, reduced motion is requested, or the detail
 * poster is hidden (below the `md` breakpoint — see `hidden md:block`).
 *
 * @param href     Destination route, e.g. `/movies/123`.
 * @param poster   The clicked card's poster element (gets the inline name).
 * @param navigate Router push — invoked to perform the actual navigation.
 */
export function startPosterViewTransition(
  href: string,
  poster: HTMLElement | null,
  navigate: (href: string) => void,
): void {
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The detail poster is `hidden md:block`; below md there is no target to morph
  // into, so skip the shared element and just navigate (still a plain crossfade).
  const hasTarget =
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

  if (
    !poster ||
    reduceMotion ||
    !hasTarget ||
    typeof document === "undefined" ||
    !("startViewTransition" in document)
  ) {
    navigate(href);
    return;
  }

  // The detail page itself contains movie cards (recommended rows), and its own
  // large poster statically carries the shared name. Leaving it named would put
  // TWO `movie-poster` elements in the OLD snapshot (browser skips the whole
  // transition) and make `waitForDetailPoster` resolve on the OLD poster. Demote
  // it — this page is being navigated away from anyway.
  const previous = document.querySelector<HTMLElement>(`[${POSTER_VT_ATTR}]`);
  if (previous) {
    previous.removeAttribute(POSTER_VT_ATTR);
    previous.style.viewTransitionName = "none";
  }

  poster.style.viewTransitionName = POSTER_VT_NAME;

  const cleanup = () => {
    poster.style.viewTransitionName = "";
  };

  const transition = document.startViewTransition(async () => {
    navigate(href);
    await waitForDetailPoster();
  });

  // Strip the inline name once the animation settles (or is skipped) so the next
  // navigation starts from a clean single-owner state.
  transition.finished.finally(cleanup);
}

/**
 * Dim-and-fly navigation (used from the detail page's "You May Also Like" row
 * instead of the poster morph).
 *
 * The ask: everything EXCEPT the poster dims immediately on click, then
 * brightens once the new detail page is on screen — while the poster keeps its
 * fly/grow animation. A shared-element View Transition can't do this without the
 * "freeze then darken" stall (its animations only start after the update
 * callback resolves, which we hold until the new poster loads). And a plain
 * black veil hides the very poster that's meant to fly. So we hand-roll both,
 * WITHOUT `startViewTransition`:
 *
 *   1. Fade a fixed veil (page background colour) IN immediately — the backdrop
 *      darkens the instant you click (opacity runs on the compositor, so it's
 *      smooth even while the main thread renders the destination).
 *   2. Clone the clicked poster and pin it ABOVE the veil at its on-screen box,
 *      so the poster stays bright while everything behind it goes dark.
 *   3. Navigate; the new detail page loads under the veil.
 *   4. Once the new large poster is on screen, FLIP the clone from the card box
 *      to the large-poster box (GPU transform) while fading the veil OUT — the
 *      backdrop brightens as the poster arrives.
 *   5. Land the clone exactly on the real poster, then remove clone + veil.
 *
 * Falls back to a veil-only dip when there's no clicked poster or the large
 * poster target is hidden (< md), and to a plain navigate under reduced motion.
 *
 * @param href     Destination route, e.g. `/movies/123`.
 * @param poster   The clicked card's poster element (cloned for the flight).
 * @param navigate Router push — invoked to perform the actual navigation.
 */
export function startDimNavigation(
  href: string,
  poster: HTMLElement | null,
  navigate: (href: string) => void,
): void {
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion || typeof document === "undefined") {
    navigate(href);
    return;
  }

  // Below md the detail poster is `hidden md:block` — no box to fly into, so
  // skip the clone and just do the darken/brighten dip.
  const hasTarget = window.matchMedia("(min-width: 768px)").matches;

  const DIM_IN_MS = 150;
  const FLIGHT_MS = 460;
  const FLY = "cubic-bezier(0.22, 1, 0.36, 1)";

  // ── The veil ────────────────────────────────────────────
  const veil = document.createElement("div");
  // `--background` is the app's dark page colour, so the backdrop dips to the
  // same tone the new page paints on. Opacity-only so the GPU owns the fade.
  veil.style.cssText =
    "position:fixed;inset:0;z-index:9999;background:var(--background,#000);" +
    `opacity:0;pointer-events:auto;will-change:opacity;transition:opacity ${DIM_IN_MS}ms ease-out;`;
  document.body.appendChild(veil);
  void veil.offsetWidth; // commit opacity:0 so the fade-in actually animates
  veil.style.opacity = "1";

  // ── The poster clone (bright, above the veil) ───────────
  const from = poster && hasTarget ? poster.getBoundingClientRect() : null;
  let clone: HTMLElement | null = null;
  if (poster && from) {
    clone = poster.cloneNode(true) as HTMLElement;
    // Inline box overrides the copied `h-full w-full relative` classes; the
    // rounded/overflow/ring classes ride along so it looks identical.
    clone.style.cssText =
      `position:fixed;margin:0;left:${from.left}px;top:${from.top}px;` +
      `width:${from.width}px;height:${from.height}px;z-index:10000;` +
      "pointer-events:none;transform-origin:top left;will-change:transform;";
    document.body.appendChild(clone);
  }

  // The page we're leaving is itself a detail page and already carries a
  // `data-vt-poster` element (its own large poster). We can't just wait for
  // "a poster to appear" — one is already there. Record the CURRENT poster's
  // image src and wait for a poster whose image differs, so the flight waits
  // until the destination movie's poster is actually on screen. Robust whether
  // React unmounts+remounts the hero (uncached) or reuses the node with a new
  // src (cached target).
  const prevSrc =
    document.querySelector<HTMLImageElement>(`[${POSTER_VT_ATTR}] img`)?.src;

  navigate(href);

  const cleanup = () => {
    clone?.remove();
    veil.remove();
  };

  waitForDetailPoster(1400, prevSrc).then(() => {
    const targetEl = document.querySelector<HTMLElement>(`[${POSTER_VT_ATTR}]`);
    const to = targetEl?.getBoundingClientRect();

    // No clone (mobile / no poster) or no target box: just brighten and go.
    if (!clone || !from || !to || to.width === 0) {
      veil.style.transition = `opacity ${FLIGHT_MS}ms ease-out`;
      veil.style.opacity = "0";
      const done = () => cleanup();
      veil.addEventListener("transitionend", done, { once: true });
      setTimeout(done, FLIGHT_MS + 80);
      return;
    }

    // FLIP: sit the clone on the destination box, then apply a compensating
    // transform so it still RENDERS at the card box (no jump) — then release the
    // transform so it flies to the destination. Hide the real poster underneath
    // until the clone lands, so there's no double image mid-flight.
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    const tx = from.left - to.left;
    const ty = from.top - to.top;

    targetEl!.style.visibility = "hidden";
    clone!.style.left = `${to.left}px`;
    clone!.style.top = `${to.top}px`;
    clone!.style.width = `${to.width}px`;
    clone!.style.height = `${to.height}px`;
    clone!.style.transition = "none";
    clone!.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
    void clone!.offsetWidth; // commit the compensating transform (renders at `from`)

    clone!.style.transition = `transform ${FLIGHT_MS}ms ${FLY}`;
    clone!.style.transform = "none"; // fly to the destination box
    veil.style.transition = `opacity ${FLIGHT_MS}ms ease-out`;
    veil.style.opacity = "0"; // brighten as the poster arrives

    const land = () => {
      if (targetEl) targetEl.style.visibility = "";
      cleanup();
    };
    clone!.addEventListener("transitionend", land, { once: true });
    setTimeout(land, FLIGHT_MS + 120); // fallback if transitionend never fires
  });
}

/**
 * Resolve once the detail page's large poster has mounted, or after a short
 * timeout so the transition never hangs (e.g. the target never appears).
 *
 * CAUTION: rendering is SUPPRESSED while the update callback's promise is
 * pending — `requestAnimationFrame` does not tick until it settles, so waiting
 * on a frame here deadlocks until Chrome's ~4s abort ("Transition was aborted
 * because of timeout in DOM update"). Timers and microtasks still run. We
 * resolve directly: the browser computes style+layout for the new snapshot
 * after resolution, so no paint-wait is needed. (Outside a View Transition —
 * e.g. from `startDimNavigation` — rAF/observers tick normally, so this works
 * there too.)
 */
function waitForDetailPoster(timeoutMs = 600, ignoreSrc?: string): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    };

    // Does this poster element count as "the destination one on screen"? When
    // `ignoreSrc` is set (dip navigation, detail→detail) the OLD poster is still
    // in the DOM with the same marker, so only a poster whose image differs from
    // the one we left counts. Without `ignoreSrc` (poster morph) any marked
    // poster qualifies — the old page's copy was demoted before this runs.
    const qualifies = (el: Element): boolean => {
      if (!ignoreSrc) return true;
      const src = el.querySelector("img")?.src;
      return !!src && src !== ignoreSrc;
    };

    // Give the poster image a beat to decode so the new snapshot isn't a blank
    // box — capped, and decode() is not rendering-bound so it works while
    // frames are suppressed.
    const settle = (el: Element) => {
      const img = el.querySelector("img");
      if (img && !img.complete) {
        Promise.race([
          img.decode().catch(() => {}),
          new Promise((r) => setTimeout(r, 250)),
        ]).then(finish);
      } else {
        finish();
      }
    };

    const check = (): boolean => {
      const el = document.querySelector(`[${POSTER_VT_ATTR}]`);
      if (el && qualifies(el)) {
        settle(el);
        return true;
      }
      return false;
    };

    if (check()) return;

    // childList/subtree catches an unmount+remount (uncached target renders a
    // loading fallback first); attributes/src catches React reusing the same
    // hero node and only swapping the poster's `src` (cached target).
    const observer = new MutationObserver(() => {
      check();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    const timer = setTimeout(finish, timeoutMs);
  });
}

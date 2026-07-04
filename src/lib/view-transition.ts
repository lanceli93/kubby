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
 * Resolve once the detail page's large poster has mounted, or after a short
 * timeout so the transition never hangs (e.g. the target never appears).
 *
 * CAUTION: rendering is SUPPRESSED while the update callback's promise is
 * pending — `requestAnimationFrame` does not tick until it settles, so waiting
 * on a frame here deadlocks until Chrome's ~4s abort ("Transition was aborted
 * because of timeout in DOM update"). Timers and microtasks still run. We
 * resolve directly: the browser computes style+layout for the new snapshot
 * after resolution, so no paint-wait is needed.
 */
function waitForDetailPoster(timeoutMs = 600): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve();
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

    const target = document.querySelector(`[${POSTER_VT_ATTR}]`);
    if (target) {
      settle(target);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(`[${POSTER_VT_ATTR}]`);
      if (el) settle(el);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(finish, timeoutMs);
  });
}

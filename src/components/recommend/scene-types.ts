import type { ComponentType } from "react";
import type {
  ActorCardData,
  ClipCardData,
  MovieCardData,
  PoolItem,
  RecommendCard,
  RecommendItemRef,
  RecommendTheme,
} from "@/lib/recommend/types";

/**
 * Scene interface for the 今晚看什么 page — the contract a visual theme
 * (Vortex today, Tabletop next) implements so the page shell can swap themes
 * without losing filters or the current hand.
 *
 * Ownership split:
 *  - The PAGE SHELL (`recommend-page.tsx`) owns all data + decisions: filters,
 *    the candidate pool query, the hand (`HAND_SIZE` slots), locks, dismiss,
 *    the draw request and its timing, navigation, toasts, the ambient backdrop.
 *  - A SCENE owns only presentation: the visual pile built from `pool`, the
 *    choreography when `drawToken` bumps / `hand` changes, and per-card motion.
 *    It renders hand cards with the SHARED faces from `card-faces.tsx`
 *    (`HandCardFace`) inside its own positioned wrapper, so both themes show
 *    identical card content.
 *
 * Card clicks: a movie card calls `onOpenMovie` (the shell runs the poster
 * morph to /movies/{id}); an actor card calls `onOpenPerson` (straight to
 * /people/{id}); a clip (video bookmark) card calls `onPlayClip` (the player
 * from the bookmark). Only cards that have finished dealing (resting) are
 * clickable.
 *
 * Draw protocol (one full draw):
 *  1. page bumps `drawToken`, sets `phase: "drawing"` and nulls every unlocked
 *     slot in `hand` → the scene animates those cards back into the pile and
 *     starts its "shuffle" (Vortex: spin-up).
 *  2. page waits for the API AND at least `drawLeadMs` of the scene definition,
 *     then fills the free slots and sets `phase: "dealt"` → the scene deals the
 *     new cards (any card whose key is new in `hand`) into their slots.
 *  3. the page keeps the draw button busy for `dealMs` more.
 * A dismiss refill simply puts one new card into a slot while `phase` stays
 * "dealt" — the scene deals it without the shuffle.
 *
 * Removal flavours: a card removed from `hand` after the scene called
 * `onDismiss` for it should leave as "thrown away"; any other removal is a
 * return to the pile.
 *
 * Performance rules for scenes: imperative per-frame work (refs + ONE rAF loop,
 * transform/opacity only), never a React re-render per frame; pause while the
 * tab is hidden; honour `reducedMotion`; clean up on unmount; no
 * backdrop-filter inside a preserve-3d subtree.
 */

export type HandSlot = RecommendCard | null;

export type DrawPhase = "idle" | "drawing" | "dealt";

/** Stable identity for pool items, hand cards and refs (`movie:123`). */
export function cardKey(ref: RecommendItemRef): string {
  return `${ref.type}:${ref.id}`;
}

export interface RecommendSceneProps {
  /** Candidate-pool sample (≤ 64, stable per page seed). Diffs animate in/out of the pile. */
  pool: PoolItem[];
  /** Exactly HAND_SIZE slots; null = empty. Index = visual position. */
  hand: HandSlot[];
  phase: DrawPhase;
  /** Bumped once per full draw — the scene's cue to shuffle. */
  drawToken: number;
  /** Keys (cardKey) of locked hand cards. */
  lockedKeys: ReadonlySet<string>;
  /** Keys of hand cards that no longer match the current filters. */
  staleKeys: ReadonlySet<string>;
  reducedMotion: boolean;
  /** Free vertical space for the hand, in px from the scene's top / bottom
   *  edges (the shell's filter bar and draw button overlay the scene). */
  insets: { top: number; bottom: number };

  /** Movie card clicked. `poster` = the face's [data-rc-poster] element (poster morph). */
  onOpenMovie: (card: MovieCardData, poster: HTMLElement | null) => void;
  onPlay: (card: MovieCardData) => void;
  onToggleLock: (card: RecommendCard) => void;
  onDismiss: (card: RecommendCard) => void;
  /** Actor card clicked — navigates to the person detail page. */
  onOpenPerson: (card: ActorCardData) => void;
  /** Clip card (or its "Play clip" pill) clicked — plays the movie from the bookmark. */
  onPlayClip: (card: ClipCardData) => void;
  /** Hover/focus changes — drives the ambient fanart backdrop. */
  onHover: (card: RecommendCard | null) => void;
}

export interface RecommendSceneDef {
  id: RecommendTheme;
  Component: ComponentType<RecommendSceneProps>;
  /** Minimum ms between the draw start and dealing the new hand. */
  drawLeadMs: number;
  /** How long dealing a full hand takes (draw button stays busy). */
  dealMs: number;
}

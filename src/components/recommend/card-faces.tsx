"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Lock, LockOpen, X, Play } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { TierFx, TierFxSurface, tierFxOf } from "@/components/ui/tier-fx";
import type {
  ActorCardData,
  MovieCardData,
  RecommendCard,
  RecommendReason,
} from "@/lib/recommend/types";

/**
 * Shared hand-card faces for every recommend scene. A scene renders these
 * inside its own positioned wrapper (which must set `--cw` = card width in px
 * and carry the `rc-card` class for the hover affordances); the face fills it
 * edge to edge. Corner buttons stop propagation so the wrapper's click (open
 * the movie / person detail page) never fires for them.
 *
 * Tier rarity FX (personal rating, `showTierEffects` pref) render on hand cards
 * only — never on pile / nebula cards. The frame sits before `.rc-face` (inside
 * the scene's `.rc-hin`, so it rides the card transform); the surface layers sit
 * inside `.rc-face`. For actors a tier rim replaces the default gold `.rc-rim`.
 */

// Hand-card corner radius (matches .rc-face in recommend.css).
const FACE_RADIUS = "14px";

const DAY_MS = 86_400_000;

// Reasons whose subject is a person or the user's own taste read in gold.
const GOLD_REASONS = new Set<RecommendReason["code"]>([
  "favActor",
  "ratedActor",
  "favorite",
  "actorMatching",
  "actorUnwatched",
]);

/** Localize a machine reason code (server never sends display strings). */
export function useReasonLabel() {
  const t = useTranslations("recommend.reasons");
  return useCallback(
    (r: RecommendReason): string => {
      switch (r.code) {
        case "highRating":
          return t("highRating", { rating: r.rating.toFixed(1) });
        case "unwatched":
          return t("unwatched");
        case "favGenre":
          return r.avg != null
            ? t("favGenreAvg", { genre: r.genre, avg: r.avg.toFixed(1) })
            : t("favGenre", { genre: r.genre });
        case "favActor":
          return t("favActor", { name: r.name });
        case "ratedActor":
          return t("ratedActor", { name: r.name, rating: r.rating.toFixed(1) });
        case "favorite":
          return t("favorite");
        case "rewatch": {
          const ts = r.lastPlayedAt ? Date.parse(r.lastPlayedAt) : NaN;
          if (!Number.isFinite(ts)) return t("rewatch");
          const days = Math.max(1, Math.floor((Date.now() - ts) / DAY_MS));
          const ago =
            days < 30
              ? t("agoDays", { count: days })
              : days < 365
                ? t("agoMonths", { count: Math.floor(days / 30) })
                : t("agoYears", { count: Math.floor(days / 365) });
          return t("rewatchAgo", { ago });
        }
        case "short":
          return t("short", { runtime: r.runtime });
        case "newlyAdded":
          return t("newlyAdded");
        case "matchesTag":
          return t("matchesTag", { tag: r.tag });
        case "actorMatching":
          return t("actorMatching", { count: r.count });
        case "actorUnwatched":
          return t("actorUnwatched", { count: r.count });
      }
    },
    [t]
  );
}

export function ReasonChips({
  reasons,
  max = 3,
  className,
}: {
  reasons: RecommendReason[];
  max?: number;
  className?: string;
}) {
  const label = useReasonLabel();
  if (!reasons.length) return null;
  return (
    <div className={`rc-reasons ${className ?? ""}`}>
      {reasons.slice(0, max).map((r, i) => {
        const text = label(r);
        return (
          <span key={`${r.code}-${i}`} className="rc-chip" data-gold={GOLD_REASONS.has(r.code)} title={text}>
            {text}
          </span>
        );
      })}
    </div>
  );
}

export interface HandCardFaceProps {
  card: RecommendCard;
  locked: boolean;
  stale: boolean;
  /** Card width in px — picks the image size to request. */
  width: number;
  /** Disable the corner buttons (e.g. while a draw is resolving). */
  interactive?: boolean;
  /** The user's `showTierEffects` pref — set by `HandCardFace`. */
  tierFx?: boolean;
  onToggleLock: (card: RecommendCard) => void;
  onDismiss: (card: RecommendCard) => void;
  onPlay?: (card: MovieCardData) => void;
}

/** Pick a server-resize width bucket (keeps the image cache hit rate high). */
function imageWidth(cssWidth: number): number {
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const px = cssWidth * dpr;
  return px <= 200 ? 200 : px <= 300 ? 300 : px <= 400 ? 400 : 600;
}

function CornerButtons({
  card,
  locked,
  interactive,
  onToggleLock,
  onDismiss,
}: Pick<HandCardFaceProps, "card" | "locked" | "interactive" | "onToggleLock" | "onDismiss">) {
  const t = useTranslations("recommend");
  return (
    <>
      <button
        type="button"
        className="rc-btn rc-btn-dismiss focus-ring"
        title={t("dismiss")}
        aria-label={t("dismiss")}
        disabled={!interactive}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(card);
        }}
      >
        <X />
      </button>
      <button
        type="button"
        className="rc-btn rc-btn-lock focus-ring"
        data-on={locked}
        title={locked ? t("locked") : t("lock")}
        aria-label={locked ? t("locked") : t("lock")}
        aria-pressed={locked}
        onClick={(e) => {
          e.stopPropagation();
          onToggleLock(card);
        }}
      >
        {locked ? <Lock /> : <LockOpen />}
      </button>
    </>
  );
}

function MovieFace({
  card,
  locked,
  stale,
  width,
  interactive = true,
  tierFx = true,
  onToggleLock,
  onDismiss,
  onPlay,
}: HandCardFaceProps & { card: MovieCardData }) {
  const t = useTranslations("recommend");
  const sub: React.ReactNode[] = [];
  if (card.year) sub.push(<span key="y">{card.year}</span>);
  if (card.rating != null && card.rating > 0)
    sub.push(
      <span key="r" className="rc-star">
        ★ {card.rating.toFixed(1)}
      </span>
    );
  if (card.personalRating != null && card.personalRating > 0)
    sub.push(
      <span key="p" className="rc-mine">
        ★ {card.personalRating.toFixed(1)}
      </span>
    );
  if (card.runtimeMinutes) sub.push(<span key="m">{t("minutes", { min: card.runtimeMinutes })}</span>);

  return (
    <>
      <TierFx rating={card.personalRating} enabled={tierFx} seed={card.id} radius={FACE_RADIUS} />
      <div
        className="rc-face"
        style={card.posterBlur ? { backgroundImage: `url(${card.posterBlur})` } : undefined}
      >
        <div className="rc-poster" data-rc-poster="">
          {card.posterPath && (
            // eslint-disable-next-line @next/next/no-img-element -- transformed per frame; next/image adds nothing here
            <img src={resolveImageSrc(card.posterPath, imageWidth(width))} alt="" draggable={false} decoding="async" />
          )}
        </div>
        <div className="rc-shade" />
        <TierFxSurface rating={card.personalRating} enabled={tierFx} seed={card.id} radius={FACE_RADIUS} />
        <div className="rc-glare" />
        {stale && <div className="rc-stale-tag">{t("stale")}</div>}
        <div className="rc-meta">
          <div className="rc-title">{card.title}</div>
          {sub.length > 0 && (
            <div className="rc-sub">
              {sub.flatMap((node, i) => (i === 0 ? [node] : [<span key={`d${i}`}>·</span>, node]))}
            </div>
          )}
          <ReasonChips reasons={card.reasons} max={width < 150 ? 1 : 2} />
        </div>
        {onPlay && (
          <button
            type="button"
            className="rc-play focus-ring"
            title={t("play")}
            aria-label={t("play")}
            disabled={!interactive}
            onClick={(e) => {
              e.stopPropagation();
              onPlay(card);
            }}
          >
            <Play fill="currentColor" />
          </button>
        )}
        <CornerButtons card={card} locked={locked} interactive={interactive} onToggleLock={onToggleLock} onDismiss={onDismiss} />
      </div>
    </>
  );
}

function ActorFace({
  card,
  locked,
  stale,
  width,
  interactive = true,
  tierFx = true,
  onToggleLock,
  onDismiss,
}: HandCardFaceProps & { card: ActorCardData }) {
  const t = useTranslations("recommend");
  const hasTierFx = tierFxOf(card.personalRating, tierFx) != null;
  return (
    <>
      {hasTierFx ? (
        <TierFx rating={card.personalRating} enabled={tierFx} seed={card.id} radius={FACE_RADIUS} />
      ) : (
        <div className="rc-rim" />
      )}
      <div
        className="rc-face actor"
        style={card.photoBlur ? { backgroundImage: `url(${card.photoBlur})` } : undefined}
      >
        {card.photoPath && (
          // eslint-disable-next-line @next/next/no-img-element -- transformed per frame; next/image adds nothing here
          <img src={resolveImageSrc(card.photoPath, imageWidth(width))} alt="" draggable={false} decoding="async" />
        )}
        <div className="rc-shade" />
        <TierFxSurface rating={card.personalRating} enabled={tierFx} seed={card.id} radius={FACE_RADIUS} />
        <div className="rc-holo" />
        <div className="rc-glare" />
        <div className="rc-badge">{t("actorBadge")}</div>
        {stale && <div className="rc-stale-tag">{t("stale")}</div>}
        <div className="rc-meta">
          <div className="rc-aname">{card.name}</div>
          <div className="rc-asub">
            {t("actorStats", { matching: card.matchingCount, unwatched: card.unwatchedCount })}
          </div>
          {/* counts already read in the stats line above — don't repeat them as chips */}
          <ReasonChips
            reasons={card.reasons.filter((r) => r.code !== "actorMatching" && r.code !== "actorUnwatched")}
            max={width < 150 ? 1 : 2}
          />
        </div>
        <CornerButtons card={card} locked={locked} interactive={interactive} onToggleLock={onToggleLock} onDismiss={onDismiss} />
      </div>
    </>
  );
}

/** Face of one hand card — fills its scene wrapper. */
export function HandCardFace(props: HandCardFaceProps) {
  const { data: prefs } = useUserPreferences();
  const tierFx = prefs?.showTierEffects !== false;
  return props.card.type === "movie" ? (
    <MovieFace {...props} tierFx={tierFx} card={props.card} />
  ) : (
    <ActorFace {...props} tierFx={tierFx} card={props.card} />
  );
}

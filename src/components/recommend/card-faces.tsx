"use client";

import { useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bookmark, Lock, LockOpen, Orbit, X, Play } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";
import { getBuiltinIcon } from "@/lib/bookmark-icons";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { TierFx, TierFxSurface, tierFxOf } from "@/components/ui/tier-fx";
import type {
  ActorCardData,
  ClipCardData,
  MovieCardData,
  RecommendCard,
  RecommendReason,
} from "@/lib/recommend/types";
import {
  D1_MAX_H,
  D1_MAX_W,
  D1_MIN_H,
  D1_PAD,
  D1_POCKET_TOP,
  D1_TUCK,
  PANO_LOOP_S,
  formatTimecode,
  hash01,
  stillBox,
} from "./clip-layout";

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
 * Clip (video bookmark) cards never get tier FX.
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

/** "3 months ago" / "3个月前" in the active locale (days < 30, months < 1y, then years). */
export function useRelativeAgo() {
  const locale = useLocale();
  const rtf = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }), [locale]);
  return useCallback(
    (iso: string): string => {
      const ts = Date.parse(iso);
      if (!Number.isFinite(ts)) return "";
      const days = Math.max(0, Math.floor((Date.now() - ts) / DAY_MS));
      if (days < 30) return rtf.format(-days, "day");
      if (days < 365) return rtf.format(-Math.floor(days / 30), "month");
      return rtf.format(-Math.floor(days / 365), "year");
    },
    [rtf]
  );
}

/** Localize a machine reason code (server never sends display strings). */
export function useReasonLabel() {
  const t = useTranslations("recommend.reasons");
  const relAgo = useRelativeAgo();
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
        case "bookmarkMoment":
          return t("bookmarkMoment", { time: formatTimecode(r.timestampSeconds), ago: relAgo(r.createdAt) });
        case "bookmarkTag":
          return t("bookmarkTag", { tag: r.tag });
      }
    },
    [t, relAgo]
  );
}

/** Accessible name of a hand card (the scenes' wrapper aria-label). */
export function useCardLabel() {
  const t = useTranslations("recommend");
  return useCallback(
    (c: RecommendCard): string =>
      c.type === "movie"
        ? c.title
        : c.type === "person"
          ? c.name
          : t("clipAria", { title: c.movieTitle, time: formatTimecode(c.timestampSeconds) }),
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
  /** Clip cards: the hover "Play clip" pill (same action as the card click). */
  onPlayClip?: (card: ClipCardData) => void;
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

/** `calc(var(--cw) * k)` — clip-face geometry is in card widths. */
const cwU = (k: number) => `calc(var(--cw, 200px) * ${k.toFixed(4)})`;

/**
 * Video-bookmark "clip" face — design D1 大幅插入 "Big tuck"
 * (data/demos/clips/index.html?v=d1): the parent poster is the dimmed
 * envelope, the bookmark frame sits big in its lower part (≈0.9cw wide, tall
 * frames take height, scope never below 0.42cw — centre-cropped), tucked
 * behind a shallow info pocket. The timecode is printed once, as the orange
 * date-stamp on the still. 360° frames pan slowly in a 16:9 window from the
 * saved camera longitude (transform-only CSS animation). Hover pulls the
 * still up and straightens it, and shows the "Play clip" pill. No tier FX.
 */
function ClipFace({
  card,
  locked,
  stale,
  width,
  interactive = true,
  onToggleLock,
  onDismiss,
  onPlayClip,
}: HandCardFaceProps & { card: ClipCardData }) {
  const t = useTranslations("recommend");
  const tPM = useTranslations("personalMetadata");
  const reasonLabel = useReasonLabel();
  const relAgo = useRelativeAgo();

  const is360 = card.viewState != null;
  const box = stillBox(card.stillAspect, is360, D1_MAX_W, D1_MAX_H, D1_MIN_H);
  const top = D1_POCKET_TOP + D1_TUCK - (box.h + 2 * D1_PAD);
  const rot = (hash01(card.id) < 0.5 ? -1 : 1) * (1.6 + hash01(`${card.id}r`) * 1.4);
  const time = formatTimecode(card.timestampSeconds);
  const icon = getBuiltinIcon(card.iconType) ?? getBuiltinIcon("bookmark")!;
  const Icon = icon.icon;
  const imgW = imageWidth(width);

  // 360°: the equirect strip (two copies, seamless) starts with the saved
  // camera longitude in the middle of the window (lon −180…180 → 0…1 of the image)
  let panoDelay = 0;
  let panoStart = 0;
  if (is360 && card.viewState) {
    const halfWindow = box.w / (box.h * 2) / 2;
    const f = ((((card.viewState.lon + 180) / 360 - halfWindow) % 1) + 1) % 1;
    panoDelay = -f * PANO_LOOP_S;
    panoStart = -f * 50;
  }

  const moment = card.reasons.find(
    (r): r is Extract<RecommendReason, { code: "bookmarkMoment" }> => r.code === "bookmarkMoment"
  );
  const ago = relAgo(moment?.createdAt ?? card.createdAt);
  const momentShort = ago ? t("reasons.bookmarkMomentShort", { ago }) : null;
  const momentLong = moment ? reasonLabel(moment) : undefined;
  // tags that matched a tag filter first
  const hitTags = new Set(
    card.reasons.flatMap((r) => (r.code === "bookmarkTag" ? [r.tag] : []))
  );
  const tags = [...card.tags].sort((a, b) => Number(hitTags.has(b)) - Number(hitTags.has(a))).slice(0, 2);

  const still = card.stillPath ? resolveImageSrc(card.stillPath, imgW) : null;

  return (
    <div
      className="rc-face rc-clip"
      style={card.posterBlur ? { backgroundImage: `url(${card.posterBlur})` } : undefined}
    >
      {card.posterPath && (
        // eslint-disable-next-line @next/next/no-img-element -- transformed per frame; next/image adds nothing here
        <img src={resolveImageSrc(card.posterPath, imgW)} alt="" draggable={false} decoding="async" />
      )}
      <div className="rc-clip-dim" />
      <div className="rc-clip-ribbon" aria-hidden>
        <Bookmark fill="currentColor" />
      </div>

      <div
        className="rc-clip-still"
        style={
          {
            top: cwU(top),
            "--rot": `${rot.toFixed(2)}deg`,
            "--lift": cwU(-0.05),
          } as React.CSSProperties
        }
      >
        <div className="rc-clip-frame" style={{ width: cwU(box.w), height: cwU(box.h) }}>
          {still &&
            (is360 ? (
              <div
                className="rc-clip-pano"
                style={
                  {
                    "--pd": `${PANO_LOOP_S}s`,
                    "--pdel": `${panoDelay.toFixed(2)}s`,
                    transform: `translateX(${panoStart.toFixed(2)}%)`,
                  } as React.CSSProperties
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- equirect strip, transform-animated */}
                <img src={still} alt="" draggable={false} decoding="async" />
                {/* eslint-disable-next-line @next/next/no-img-element -- second copy closes the loop */}
                <img src={still} alt="" draggable={false} decoding="async" />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- transformed per frame; next/image adds nothing here
              <img className="rc-clip-img" src={still} alt="" draggable={false} decoding="async" />
            ))}
          {is360 && (
            <span className="rc-clip-360">
              <Orbit />
              360°
            </span>
          )}
          <span className="rc-clip-stamp" style={{ bottom: cwU(D1_TUCK + 0.026) }}>
            {time}
          </span>
        </div>
        <button
          type="button"
          className="rc-clip-play focus-ring"
          title={t("playClip")}
          disabled={!interactive}
          onClick={(e) => {
            e.stopPropagation();
            onPlayClip?.(card);
          }}
        >
          <Play fill="currentColor" />
          <span>{t("playClip")}</span>
        </button>
      </div>

      <div className="rc-clip-pocket" style={{ top: cwU(D1_POCKET_TOP) }}>
        <i className="rc-clip-seam" />
        <div className="rc-clip-row">
          <Icon
            style={{ color: icon.hexColor }}
            fill={icon.id === "star" || icon.id === "heart" ? "currentColor" : "none"}
          />
          <span className="rc-clip-lab" style={{ color: icon.hexColor }}>
            {tPM(`builtinIcon_${icon.id}`)}
          </span>
          <span>·</span>
          <b>{card.movieTitle}</b>
          {card.year != null && <span className="rc-clip-yr">{card.year}</span>}
        </div>
        <div className="rc-clip-chips">
          {momentShort && (
            <span className="rc-chip" data-cyan="true" title={momentLong}>
              {momentShort}
            </span>
          )}
          {tags.map((tag) => (
            <span key={tag} className="rc-chip" data-tag="true" data-hit={hitTags.has(tag)} title={`#${tag}`}>
              #{tag}
            </span>
          ))}
        </div>
      </div>

      <div className="rc-glare" />
      {stale && <div className="rc-stale-tag">{t("stale")}</div>}
      <CornerButtons card={card} locked={locked} interactive={interactive} onToggleLock={onToggleLock} onDismiss={onDismiss} />
    </div>
  );
}

/** Face of one hand card — fills its scene wrapper. */
export function HandCardFace(props: HandCardFaceProps) {
  const { data: prefs } = useUserPreferences();
  const tierFx = prefs?.showTierEffects !== false;
  const { card } = props;
  if (card.type === "bookmark") return <ClipFace {...props} card={card} />;
  return card.type === "movie" ? (
    <MovieFace {...props} tierFx={tierFx} card={card} />
  ) : (
    <ActorFace {...props} tierFx={tierFx} card={card} />
  );
}

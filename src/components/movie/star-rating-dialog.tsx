"use client";

import { useState, useEffect } from "react";
import { Star, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getTier, getTierColor, getTierBorderColor, getTierGlow } from "@/lib/tier";

interface StarRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: number | null;
  onSave: (rating: number | null, dimensionRatings?: Record<string, number> | null) => void;
  dimensions?: string[];
  dimensionRatings?: Record<string, number> | null;
  showTier?: boolean;
}

function StarRow({
  rating,
  hoverRating,
  onStarClick,
  onHover,
  onLeave,
  onFine,
  starSize = "h-9 w-9",
}: {
  rating: number | null;
  hoverRating: number | null;
  onStarClick: (starIndex: number, isHalf: boolean) => void;
  onHover: (val: number) => void;
  onLeave: () => void;
  onFine: (delta: number) => void;
  starSize?: string;
}) {
  const displayRating = hoverRating ?? rating;

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={onLeave}
      >
        {[0, 1, 2, 3, 4].map((starIndex) => {
          const starValue = (starIndex + 1) * 2;
          const halfValue = starValue - 1;
          const current = displayRating ?? 0;

          let fill: "full" | "half" | "empty" = "empty";
          if (current >= starValue) fill = "full";
          else if (current >= halfValue) fill = "half";

          return (
            <div
              key={starIndex}
              className={`relative ${starSize} cursor-pointer`}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const isLeft = e.clientX - rect.left < rect.width / 2;
                onHover(isLeft ? halfValue : starValue);
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const isLeft = e.clientX - rect.left < rect.width / 2;
                onStarClick(starIndex, isLeft);
              }}
            >
              <Star className={`absolute inset-0 ${starSize} text-white/20`} />
              {fill !== "empty" && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: fill === "full" ? "100%" : "50%" }}
                >
                  <Star className={`${starSize} fill-[var(--gold)] text-[var(--gold)]`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onFine(-0.1)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 text-white/70 text-xs transition-colors hover:bg-white/10"
        >
          −
        </button>
        <span className="min-w-[2.5rem] text-center text-sm font-bold text-[var(--gold)] tabular-nums">
          {rating != null ? rating.toFixed(1) : "—"}
        </span>
        <button
          onClick={() => onFine(0.1)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/30 text-white/70 text-xs transition-colors hover:bg-white/10"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function StarRatingDialog({
  open,
  onOpenChange,
  value,
  onSave,
  dimensions,
  dimensionRatings: initialDimensionRatings,
  showTier,
}: StarRatingDialogProps) {
  const t = useTranslations("metadata");
  const tCommon = useTranslations("common");
  const tPm = useTranslations("personalMetadata");
  const [rating, setRating] = useState<number | null>(value);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [dimRatings, setDimRatings] = useState<Record<string, number>>({});
  const [dimHovers, setDimHovers] = useState<Record<string, number | null>>({});

  const hasDimensions = dimensions && dimensions.length > 0;

  useEffect(() => {
    if (open) {
      setRating(value);
      if (hasDimensions && initialDimensionRatings) {
        setDimRatings(initialDimensionRatings);
      } else {
        setDimRatings({});
      }
      setDimHovers({});
    }
  }, [open, value, hasDimensions, initialDimensionRatings]);

  // Compute average from dimension ratings
  const computeAverage = (ratings: Record<string, number>): number | null => {
    const values = Object.values(ratings).filter((v) => v > 0);
    if (values.length === 0) return null;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.round(avg * 10) / 10;
  };

  const displayRating = hoverRating ?? rating;

  const handleStarClick = (starIndex: number, isHalf: boolean) => {
    const newRating = (starIndex + 1) * 2 - (isHalf ? 1 : 0);
    setRating(newRating);
  };

  const handleFine = (delta: number) => {
    setRating((prev) => {
      const base = prev ?? 0;
      const next = Math.round((base + delta) * 10) / 10;
      return Math.max(0, Math.min(10, next));
    });
  };

  const handleDimStarClick = (dim: string, starIndex: number, isHalf: boolean) => {
    const newRating = (starIndex + 1) * 2 - (isHalf ? 1 : 0);
    setDimRatings((prev) => {
      const updated = { ...prev, [dim]: newRating };
      // Update overall rating as average
      const avg = computeAverage(updated);
      if (avg !== null) setRating(avg);
      return updated;
    });
  };

  const handleDimFine = (dim: string, delta: number) => {
    setDimRatings((prev) => {
      const base = prev[dim] ?? 0;
      const next = Math.max(0, Math.min(10, Math.round((base + delta) * 10) / 10));
      const updated = { ...prev, [dim]: next };
      const avg = computeAverage(updated);
      if (avg !== null) setRating(avg);
      return updated;
    });
  };

  const handleSave = () => {
    if (hasDimensions) {
      const avg = computeAverage(dimRatings);
      onSave(avg, dimRatings);
    } else {
      onSave(rating);
    }
    onOpenChange(false);
  };

  const handleClear = () => {
    onSave(null, hasDimensions ? null : undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`!bg-black/40 border-white/[0.06] backdrop-blur-xl ${hasDimensions ? "sm:max-w-[480px]" : "sm:max-w-[340px]"}`}>
        <DialogHeader>
          <DialogTitle>{t("personalRating")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {hasDimensions ? (
            <>
              {/* Dimension rows */}
              <div className="flex flex-col gap-3">
                {dimensions.map((dim) => (
                  <div key={dim} className="flex items-center gap-3">
                    <span className="min-w-[4rem] text-sm text-white/70 truncate">{dim}</span>
                    <StarRow
                      rating={dimRatings[dim] ?? null}
                      hoverRating={dimHovers[dim] ?? null}
                      onStarClick={(si, ih) => handleDimStarClick(dim, si, ih)}
                      onHover={(val) => setDimHovers((prev) => ({ ...prev, [dim]: val }))}
                      onLeave={() => setDimHovers((prev) => ({ ...prev, [dim]: null }))}
                      onFine={(delta) => handleDimFine(dim, delta)}
                      starSize="h-6 w-6"
                    />
                  </div>
                ))}
              </div>

              {/* Computed average */}
              <div className="flex items-center justify-center gap-2 border-t border-white/10 pt-3">
                <span className="text-sm text-white/50">{tPm("overall")}:</span>
                <span className="text-xl font-bold text-[var(--gold)] tabular-nums">
                  {rating != null ? rating.toFixed(1) : "—"}
                </span>
                {showTier && rating != null && rating > 0 && (() => {
                  const tier = getTier(rating);
                  return (
                    <span className={`rounded-md border px-2 py-0.5 text-sm font-black tracking-wider ${getTierColor(tier)} ${getTierBorderColor(tier)} ${getTierGlow(tier)}`}>
                      {tier}
                    </span>
                  );
                })()}
              </div>
            </>
          ) : (
            <>
              {/* Original single-rating UI */}
              <div className="flex flex-col items-center gap-4">
                <div
                  className="flex items-center gap-0.5"
                  onMouseLeave={() => setHoverRating(null)}
                >
                  {[0, 1, 2, 3, 4].map((starIndex) => {
                    const starValue = (starIndex + 1) * 2;
                    const halfValue = starValue - 1;
                    const current = displayRating ?? 0;

                    let fill: "full" | "half" | "empty" = "empty";
                    if (current >= starValue) fill = "full";
                    else if (current >= halfValue) fill = "half";

                    return (
                      <div
                        key={starIndex}
                        className="relative h-9 w-9 cursor-pointer"
                        onMouseMove={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const isLeft = e.clientX - rect.left < rect.width / 2;
                          setHoverRating(isLeft ? halfValue : starValue);
                        }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const isLeft = e.clientX - rect.left < rect.width / 2;
                          handleStarClick(starIndex, isLeft);
                        }}
                      >
                        <Star className="absolute inset-0 h-9 w-9 text-white/20" />
                        {fill !== "empty" && (
                          <div
                            className="absolute inset-0 overflow-hidden"
                            style={{ width: fill === "full" ? "100%" : "50%" }}
                          >
                            <Star className="h-9 w-9 fill-[var(--gold)] text-[var(--gold)]" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Numeric display + fine controls */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleFine(-0.1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:bg-white/10"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[3.5rem] text-center text-2xl font-bold text-[var(--gold)] tabular-nums">
                    {rating != null ? rating.toFixed(1) : "—"}
                  </span>
                  <button
                    onClick={() => handleFine(0.1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:bg-white/10"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                {showTier && rating != null && rating > 0 && (() => {
                  const tier = getTier(rating);
                  return (
                    <span className={`rounded-md border px-2.5 py-1 text-base font-black tracking-wider ${getTierColor(tier)} ${getTierBorderColor(tier)} ${getTierGlow(tier)}`}>
                      {tier}
                    </span>
                  );
                })()}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex w-full items-center justify-between pt-1">
            <button
              onClick={handleClear}
              className="rounded-md px-3 py-1.5 text-sm text-red-400/70 transition-colors hover:text-red-400"
            >
              {t("clearRating")}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenChange(false)}
                className="rounded-md px-3 py-1.5 text-sm text-white/50 transition-colors hover:text-white/80"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={handleSave}
                className="rounded-md border border-white/20 px-5 py-1.5 text-sm font-medium text-white hover:bg-white/10"
              >
                {tCommon("save")}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

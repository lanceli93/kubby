"use client";

import { useState, useEffect } from "react";
import { Star, Minus, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StarRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: number | null;
  onSave: (rating: number | null) => void;
}

export function StarRatingDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: StarRatingDialogProps) {
  const t = useTranslations("metadata");
  const tCommon = useTranslations("common");
  const [rating, setRating] = useState<number | null>(value);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  useEffect(() => {
    if (open) setRating(value);
  }, [open, value]);

  const displayRating = hoverRating ?? rating;

  const handleStarClick = (starIndex: number, isHalf: boolean) => {
    // starIndex is 0-4, each star = 2 points
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

  const handleSave = () => {
    onSave(rating);
    onOpenChange(false);
  };

  const handleClear = () => {
    onSave(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/[0.06] bg-black/80 backdrop-blur-xl sm:max-w-[340px]">
        <DialogHeader>
          <DialogTitle>{t("personalRating")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {/* Stars row */}
          <div
            className="flex items-center gap-0.5"
            onMouseLeave={() => setHoverRating(null)}
          >
            {[0, 1, 2, 3, 4].map((starIndex) => {
              const starValue = (starIndex + 1) * 2; // Full star value (2, 4, 6, 8, 10)
              const halfValue = starValue - 1; // Half star value (1, 3, 5, 7, 9)
              const current = displayRating ?? 0;

              // Determine fill: full, half, or empty
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
                  {/* Empty star background */}
                  <Star className="absolute inset-0 h-9 w-9 text-white/20" />
                  {/* Filled portion */}
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

          {/* Actions */}
          <div className="flex w-full items-center justify-between pt-1">
            <button
              onClick={handleClear}
              className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-white/50 transition-colors hover:text-white/80"
            >
              <X className="h-3.5 w-3.5" />
              {tCommon("cancel")}
            </button>
            <button
              onClick={handleSave}
              className="rounded-md bg-primary px-5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {tCommon("save")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ScrollRowProps {
  children: ReactNode;
  title?: string;
}

export function ScrollRow({ children, title }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    checkScroll();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, []);

  const scroll = (dir: "left" | "right") => {
    const el = ref.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  const showNav = canScrollLeft || canScrollRight;

  return (
    <div className="flex flex-col gap-3">
      {/* Title row with nav buttons */}
      {title && (
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          {showNav && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => scroll("left")}
                disabled={!canScrollLeft}
                className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => scroll("right")}
                disabled={!canScrollRight}
                className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scrollable content */}
      <div className="group/scroll relative">
        {/* Floating scroll buttons (when no title) */}
        {!title && canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute -left-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black/90 group-hover/scroll:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {!title && canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute -right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black/90 group-hover/scroll:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        <div
          ref={ref}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-2"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

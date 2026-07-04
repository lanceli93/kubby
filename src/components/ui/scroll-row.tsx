"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ScrollRowProps {
  children: ReactNode;
  title?: ReactNode;
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
        <div className="relative z-10 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          {showNav && (
            <div className="hidden md:flex items-center gap-1">
              <button
                onClick={() => scroll("left")}
                disabled={!canScrollLeft}
                className="text-white transition-colors hover:text-white/80 disabled:text-white/20"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => scroll("right")}
                disabled={!canScrollRight}
                className="text-white transition-colors hover:text-white/80 disabled:text-white/20"
              >
                <ChevronRight className="h-5 w-5" />
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
            className="absolute -left-1 top-1/2 z-10 hidden md:flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black/90 group-hover/scroll:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {!title && canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute -right-1 top-1/2 z-10 hidden md:flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black/90 group-hover/scroll:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* Bleed room for the hover glow: `overflow-x: auto` forces overflow-y
            to auto, so the ambilight clips at the scrollport. Vertical padding
            (80px, cancelled by negative margin) exceeds the blur's visible
            falloff; horizontally the page gutter caps us at 40px, so a mask
            fades the outer 40px to transparent — the glow dissolves instead of
            hitting a hard clip line. pointer-events-none keeps the enlarged
            invisible box from stealing clicks from the section above. */}
        <div
          ref={ref}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory md:snap-none [&>*]:snap-start md:-mx-10 md:-my-20 md:px-10 md:py-20 md:scroll-px-10 md:pointer-events-none md:[&>*]:pointer-events-auto md:[mask-image:linear-gradient(to_right,transparent,black_40px,black_calc(100%_-_40px),transparent)]"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

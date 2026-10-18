"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { DomainItem } from "@/hooks/use-domain-items";

type AnchorProps = Omit<React.ComponentPropsWithoutRef<typeof Link>, "href" | "children">;

export interface DomainCardProps extends DomainItem, AnchorProps {
  /** "drawer" (default) matches the ~14.5rem-wide left drawer row; "menu" is
   *  a touch more compact for use inside a DropdownMenuContent. */
  size?: "drawer" | "menu";
}

// Fan geometry for the 3 preview thumbs: rest position (slight overlap,
// alternating rotation) and the hover/focus spread. motion-safe: gates the
// spread so prefers-reduced-motion users get the rest layout with no
// animation at all, per the UI design system's accessibility rules.
const FAN = [
  {
    rest: "-translate-x-1 -translate-y-0 -rotate-[8deg] z-0",
    spread: "motion-safe:group-hover:-translate-x-2 motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:-rotate-[10deg] motion-safe:group-focus-visible:-translate-x-2 motion-safe:group-focus-visible:-translate-y-1 motion-safe:group-focus-visible:-rotate-[10deg]",
  },
  {
    rest: "translate-x-0 translate-y-0 rotate-0 z-[1]",
    spread: "motion-safe:group-hover:-translate-y-1.5 motion-safe:group-focus-visible:-translate-y-1.5",
  },
  {
    rest: "translate-x-1 translate-y-0 rotate-[8deg] z-[2]",
    spread: "motion-safe:group-hover:translate-x-2 motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:rotate-[10deg] motion-safe:group-focus-visible:translate-x-2 motion-safe:group-focus-visible:-translate-y-1 motion-safe:group-focus-visible:rotate-[10deg]",
  },
];

/** A domain-switcher row upgraded into a card: icon + label on the left, a
 *  small fanned stack of that domain's own preview art on the right (spreads
 *  apart + lifts on hover/focus), with a very faint blurred backdrop tinted
 *  from the first preview. Used by NavSidebar's MEDIA group and (as
 *  `<DropdownMenuItem asChild><DomainCard size="menu" .../></DropdownMenuItem>`)
 *  the AppHeader brand dropdown — a `next/link` + forwardRef for that reason.
 *  Empty/loading previews render icon + label only — the row height stays
 *  fixed either way, so there's no layout jump when previews arrive. */
export const DomainCard = React.forwardRef<HTMLAnchorElement, DomainCardProps>(
  function DomainCard(
    { domain, href, label, icon: Icon, previews, active, size = "drawer", className, ...rest },
    ref
  ) {
    const isSquare = domain === "photos" || domain === "music";
    const backdrop = previews[0];
    const shown = previews.slice(0, 3);

    return (
      <Link
        ref={ref}
        href={href}
        aria-current={active ? "page" : undefined}
        className={`focus-ring group relative isolate flex items-center gap-3 overflow-hidden rounded-lg px-3 transition-fluid cursor-pointer ${
          size === "menu" ? "h-12 w-full" : "h-[3.5rem]"
        } ${
          active
            ? "bg-white/[0.08] ring-1 ring-white/[0.06]"
            : "ring-1 ring-transparent hover:bg-white/[0.06]"
        } ${className ?? ""}`}
        {...rest}
      >
        {/* Faint blurred backdrop from the first preview — subtle at rest,
            a touch more visible when active/hovered. Contained by `isolate`
            on the Link so -z-10 stays behind the card content, never the
            page behind it. Purely decorative. */}
        {backdrop && (
          <img
            src={backdrop}
            alt=""
            aria-hidden
            draggable={false}
            loading="lazy"
            className={`pointer-events-none absolute inset-0 -z-10 h-full w-full scale-125 object-cover blur-2xl transition-fluid motion-reduce:transition-none ${
              active ? "opacity-[0.14]" : "opacity-0 group-hover:opacity-[0.08] group-focus-visible:opacity-[0.08]"
            }`}
          />
        )}

        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
        <span
          className={`flex-1 truncate text-sm ${
            active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          }`}
        >
          {label}
        </span>
        {active && <Check className="h-4 w-4 shrink-0 text-primary" />}

        {shown.length > 0 && (
          <div className={`relative shrink-0 ${size === "menu" ? "h-8 w-10" : "h-10 w-12"}`}>
            {shown.map((src, i) => {
              const fan = FAN[i] ?? FAN[FAN.length - 1];
              const thumbSize = isSquare
                ? size === "menu"
                  ? "h-6 w-6"
                  : "h-8 w-8"
                : size === "menu"
                  ? "h-8 w-[1.4rem]"
                  : "h-10 w-7";
              return (
                <img
                  key={src}
                  src={src}
                  alt=""
                  aria-hidden
                  draggable={false}
                  loading="lazy"
                  className={`absolute inset-0 m-auto rounded-sm object-cover shadow-[0_2px_6px_rgba(0,0,0,0.5)] ring-1 ring-white/10 transition-fluid motion-reduce:transition-none ${thumbSize} ${fan.rest} ${fan.spread}`}
                />
              );
            })}
          </div>
        )}
      </Link>
    );
  }
);

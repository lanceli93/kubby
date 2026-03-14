"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Film, Search, Settings } from "lucide-react";

const tabs = [
  { label: "Home", href: "/", icon: House },
  { label: "Movies", href: "/movies", icon: Film },
  { label: "Search", href: "/search", icon: Search },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function BottomTabs() {
  const pathname = usePathname();

  // Hide on player pages
  if (/^\/movies\/[^/]+\/play$/.test(pathname)) return null;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex md:hidden h-14 items-center justify-around border-t border-white/[0.06] bg-[var(--header)] backdrop-blur-xl">
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/"
            ? pathname === "/"
            : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] transition-colors ${
              isActive
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

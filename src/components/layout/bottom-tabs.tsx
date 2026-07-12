"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Film, Images, Music, Tv, Search, Settings } from "lucide-react";
import { useCurrentDomain } from "@/hooks/use-current-domain";

const homeTab = { label: "Home", href: "/", icon: House };
const searchTab = { label: "Search", href: "/search", icon: Search };
const preferencesTab = { label: "Preferences", href: "/preferences", icon: Settings };

const mediaTabByDomain = {
  cinema: { label: "Movies", href: "/movies", icon: Film },
  tv: { label: "TV", href: "/tv", icon: Tv },
  photos: { label: "Photos", href: "/photos", icon: Images },
  music: { label: "Music", href: "/music", icon: Music },
};

export function BottomTabs() {
  const pathname = usePathname();
  const domain = useCurrentDomain();

  // Hide on player pages / immersive full-screen viewers
  if (/^\/movies\/[^/]+\/play$/.test(pathname)) return null;
  if (/^\/tv\/episodes\/[^/]+\/play$/.test(pathname)) return null;
  if (/^\/photos\/view\/[^/]+$/.test(pathname)) return null;

  // Tab order: Home, <current domain's media tab>, Search, Preferences.
  const tabs = [homeTab, mediaTabByDomain[domain], searchTab, preferencesTab];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex md:hidden h-[calc(3.5rem+env(safe-area-inset-bottom))] items-center justify-around border-t border-white/[0.06] bg-[var(--header)] pb-safe backdrop-blur-xl">
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
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] transition-fluid ${
              isActive
                ? "text-primary bg-white/[0.06] rounded-lg"
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

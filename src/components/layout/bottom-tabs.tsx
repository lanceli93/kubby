"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Film, Images, Music, Search, Settings } from "lucide-react";
import { useHasPhotoLibrary } from "@/hooks/use-has-photo-library";
import { useHasMusicLibrary } from "@/hooks/use-has-music-library";

const baseTabs = [
  { label: "Home", href: "/", icon: House },
  { label: "Movies", href: "/movies", icon: Film },
  { label: "Search", href: "/search", icon: Search },
  { label: "Preferences", href: "/preferences", icon: Settings },
];

const photosTab = { label: "Photos", href: "/photos", icon: Images };
const musicTab = { label: "Music", href: "/music", icon: Music };

export function BottomTabs() {
  const pathname = usePathname();
  const hasPhotoLibrary = useHasPhotoLibrary();
  const hasMusicLibrary = useHasMusicLibrary();

  // Hide on player pages
  if (/^\/movies\/[^/]+\/play$/.test(pathname)) return null;

  // Insert Photos then Music right after Movies (index 2) so tab order is
  // Home, Movies, [Photos], [Music], Search, Preferences.
  const mediaTabs = [
    ...(hasPhotoLibrary ? [photosTab] : []),
    ...(hasMusicLibrary ? [musicTab] : []),
  ];
  const tabs =
    mediaTabs.length > 0
      ? [...baseTabs.slice(0, 2), ...mediaTabs, ...baseTabs.slice(2)]
      : baseTabs;

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

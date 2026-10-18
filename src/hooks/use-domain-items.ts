"use client";

import { useCallback, type ComponentType, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Clapperboard, Tv, Images, Music } from "lucide-react";
import { useCurrentDomain, type MediaDomain } from "@/hooks/use-current-domain";
import { useHasTvLibrary } from "@/hooks/use-has-tv-library";
import { useHasPhotoLibrary } from "@/hooks/use-has-photo-library";
import { useHasMusicLibrary } from "@/hooks/use-has-music-library";
import { useNavDrawer } from "@/components/layout/nav-drawer";
import {
  isModifiedClick,
  startDomainTransition,
  type DomainTransitionSource,
} from "@/lib/view-transition";

interface DomainPreviewResponse {
  cinema?: string[];
  tv?: string[];
  photos?: string[];
  music?: string[];
}

export interface DomainItem {
  domain: MediaDomain;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Up to 3 preview image URLs from GET /api/domains/preview — empty while
   *  loading or when the domain has no item with an image yet. */
  previews: string[];
  active: boolean;
}

/** The ordered domain list (Cinema → TV → Photos → Music) with preview art,
 *  for the rich DomainCard in both switchers (NavSidebar's MEDIA group and the
 *  AppHeader brand dropdown). Cinema is always present, the rest only when a
 *  library of that type exists. */
export function useDomainItems(): DomainItem[] {
  const tNav = useTranslations("nav");
  const domain = useCurrentDomain();
  const hasTvLibrary = useHasTvLibrary();
  const hasPhotoLibrary = useHasPhotoLibrary();
  const hasMusicLibrary = useHasMusicLibrary();

  const { data: previews } = useQuery<DomainPreviewResponse>({
    queryKey: ["domain-previews"],
    queryFn: () => fetch("/api/domains/preview").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const items: DomainItem[] = [
    {
      domain: "cinema",
      href: "/",
      label: tNav("cinema"),
      icon: Clapperboard,
      previews: previews?.cinema ?? [],
      active: domain === "cinema",
    },
  ];

  if (hasTvLibrary) {
    items.push({
      domain: "tv",
      href: "/tv",
      label: tNav("tv"),
      icon: Tv,
      previews: previews?.tv ?? [],
      active: domain === "tv",
    });
  }
  if (hasPhotoLibrary) {
    items.push({
      domain: "photos",
      href: "/photos",
      label: tNav("photos"),
      icon: Images,
      previews: previews?.photos ?? [],
      active: domain === "photos",
    });
  }
  if (hasMusicLibrary) {
    items.push({
      domain: "music",
      href: "/music",
      label: tNav("music"),
      icon: Music,
      previews: previews?.music ?? [],
      active: domain === "music",
    });
  }

  return items;
}

/** Click handler for a DomainCard: plain primary clicks run the spatial
 *  domain-switch View Transition (`startDomainTransition`); modifier / middle
 *  clicks fall through to next/link's native behaviour (new tab etc.).
 *  Clicking the domain home you're already on just closes the drawer. */
export function useDomainSwitch(from: DomainTransitionSource) {
  const router = useRouter();
  const pathname = usePathname();
  const { setOpen } = useNavDrawer();

  return useCallback(
    (e: MouseEvent<HTMLAnchorElement>, item: DomainItem) => {
      if (isModifiedClick(e)) return;
      e.preventDefault();
      if (pathname === item.href) {
        setOpen(false);
        return;
      }
      startDomainTransition({
        href: item.href,
        domain: item.domain,
        from,
        navigate: (href) => router.push(href),
        closeDrawer: () => setOpen(false),
      });
    },
    [from, pathname, router, setOpen]
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

export type MediaDomain = "cinema" | "photos" | "music" | "tv";

// Domain owned by the current route, or null for neutral pages (search,
// profile, preferences, dashboard) that don't belong to any domain.
// Mirrors the route→domain mapping in DomainCookieSync / auth.config.ts.
function domainFromPath(pathname: string): MediaDomain | null {
  if (pathname.startsWith("/photos")) return "photos";
  if (pathname.startsWith("/music")) return "music";
  if (pathname.startsWith("/tv")) return "tv";
  if (
    pathname === "/" ||
    pathname.startsWith("/movies") ||
    pathname.startsWith("/people") ||
    pathname.startsWith("/metadata")
  )
    return "cinema";
  return null;
}

// Cookies have no change-notification API; the cookie only changes on
// navigation (DomainCookieSync), which re-renders consumers anyway, so a
// no-op subscription is enough — useSyncExternalStore re-reads the snapshot
// every render.
function subscribe() {
  return () => {};
}

function readCookieDomain(): MediaDomain {
  const m = document.cookie.match(
    /(?:^|;\s*)kubby-domain=(cinema|photos|music|tv)/
  );
  return (m?.[1] as MediaDomain) ?? "cinema";
}

// Which media domain the user is currently "in". Domain-owning routes decide
// directly; neutral pages fall back to the kubby-domain cookie (written by
// DomainCookieSync on every domain-owning navigation) so e.g. the sidebar
// opened from /preferences still shows the domain the user came from.
// Server snapshot is "cinema" — the client corrects itself after hydration.
export function useCurrentDomain(): MediaDomain {
  const pathname = usePathname();
  const cookieDomain = useSyncExternalStore(
    subscribe,
    readCookieDomain,
    () => "cinema" as MediaDomain
  );
  return domainFromPath(pathname) ?? cookieDomain;
}

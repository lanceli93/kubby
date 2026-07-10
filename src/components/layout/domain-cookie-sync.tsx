"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

interface LibraryTypeOnly {
  type: string;
}

function writeCookie(domain: "cinema" | "photos") {
  document.cookie = `kubby-domain=${domain}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

// Persists which domain (cinema vs photos) the user last visited so that
// reopening the site at "/" can jump straight to their domain without a
// flash of the other one (see the "/" redirect in src/lib/auth.config.ts's
// authorized callback, which reads this same cookie).
//
// Only the two domain-owning route groups update the cookie; shared/neutral
// pages (search, profile, preferences, dashboard) intentionally leave it
// untouched since they don't belong to either domain.
export function DomainCookieSync() {
  const pathname = usePathname();

  // Shares the ["libraries"] cache with the nav hooks (no extra request). Used
  // to self-heal a stale "photos" cookie: the proxy redirect in auth.config.ts
  // can't query the DB, so if the photo library is later deleted the cookie
  // would keep bouncing "/" → "/photos" (an empty page with no nav entry).
  // Once library data resolves and no photo library exists, reset to cinema.
  const { data: libraries } = useQuery<LibraryTypeOnly[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (Array.isArray(libraries) && !libraries.some((lib) => lib.type === "photo")) {
      // No photo library exists — the photos domain isn't reachable, so never
      // leave a "photos" cookie that would redirect the root there.
      if (document.cookie.includes("kubby-domain=photos")) writeCookie("cinema");
      return;
    }

    let domain: "cinema" | "photos" | null = null;
    if (pathname.startsWith("/photos")) domain = "photos";
    else if (pathname === "/" || pathname.startsWith("/movies")) domain = "cinema";

    if (!domain) return;
    writeCookie(domain);
  }, [pathname, libraries]);

  return null;
}

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

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

  useEffect(() => {
    let domain: "cinema" | "photos" | null = null;
    if (pathname.startsWith("/photos")) domain = "photos";
    else if (pathname === "/" || pathname.startsWith("/movies")) domain = "cinema";

    if (!domain) return;

    document.cookie = `kubby-domain=${domain}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [pathname]);

  return null;
}

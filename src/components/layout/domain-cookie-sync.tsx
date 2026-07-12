"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

interface LibraryTypeOnly {
  type: string;
}

function writeCookie(domain: "cinema" | "photos" | "music" | "tv") {
  document.cookie = `kubby-domain=${domain}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

// Persists which domain (cinema vs photos vs music) the user last visited so that
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
  // to self-heal a stale "photos"/"music" cookie: the proxy redirect in
  // auth.config.ts can't query the DB, so if the photo/music library is later
  // deleted the cookie would keep bouncing "/" → "/photos" (or "/music"), an
  // empty page with no nav entry. Once library data resolves and no library of
  // that type exists, reset the cookie to cinema.
  const { data: libraries } = useQuery<LibraryTypeOnly[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (Array.isArray(libraries)) {
      const hasPhoto = libraries.some((lib) => lib.type === "photo");
      const hasMusic = libraries.some((lib) => lib.type === "music");
      const hasTv = libraries.some((lib) => lib.type === "tvshow");
      // No photo/music/tv library exists — that domain isn't reachable, so never
      // leave a matching cookie that would redirect the root there.
      if (!hasPhoto && document.cookie.includes("kubby-domain=photos")) {
        writeCookie("cinema");
        return;
      }
      if (!hasMusic && document.cookie.includes("kubby-domain=music")) {
        writeCookie("cinema");
        return;
      }
      if (!hasTv && document.cookie.includes("kubby-domain=tv")) {
        writeCookie("cinema");
        return;
      }
    }

    let domain: "cinema" | "photos" | "music" | "tv" | null = null;
    if (pathname.startsWith("/photos")) domain = "photos";
    else if (pathname.startsWith("/music")) domain = "music";
    else if (pathname.startsWith("/tv")) domain = "tv";
    else if (pathname === "/" || pathname.startsWith("/movies")) domain = "cinema";

    if (!domain) return;
    writeCookie(domain);
  }, [pathname, libraries]);

  return null;
}

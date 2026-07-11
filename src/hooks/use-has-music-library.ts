"use client";

import { useQuery } from "@tanstack/react-query";

interface LibraryTypeOnly {
  type: string;
}

// Nav components (header pills, sidebar, bottom tabs) need to know only
// whether a "music" library exists — not the full library payload (cover
// images, folder paths, etc). We still hit /api/libraries (same endpoint
// and query key ["libraries"] used elsewhere) so this shares a cache entry
// with the home page / dashboard instead of firing a second request, and a
// long staleTime keeps it cheap on domains that never touch music.
export function useHasMusicLibrary() {
  const { data } = useQuery<LibraryTypeOnly[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  return data?.some((lib) => lib.type === "music") ?? false;
}

"use client";

import { useQuery } from "@tanstack/react-query";

interface Library {
  id: string;
  name: string;
  type: string;
}

// The photo libraries only, derived from the shared ["libraries"] cache (same
// endpoint the home page / nav hooks use — no extra request). Used by the
// photos domain for its library filter and album-library association.
export function usePhotoLibraries() {
  const { data } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  return (data ?? []).filter((lib) => lib.type === "photo");
}

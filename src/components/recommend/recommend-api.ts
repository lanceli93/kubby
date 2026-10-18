import type {
  DrawRequest,
  DrawResponse,
  HistoryRequest,
  PoolResponse,
  RecommendFilters,
} from "@/lib/recommend/types";

// Client fetchers for /api/movies/recommend/*. Cinema-only by construction:
// the server allowlists movie libraries.

/** Stable query string for the pool request (also the React Query key). */
export function poolQueryString(f: RecommendFilters): string {
  const p = new URLSearchParams();
  if (f.genres?.length) p.set("genres", [...f.genres].sort().join(","));
  if (f.tags?.length) p.set("tags", [...f.tags].sort().join(","));
  if (f.minRating) p.set("minRating", String(f.minRating));
  if (f.yearFrom != null) p.set("yearFrom", String(f.yearFrom));
  if (f.yearTo != null) p.set("yearTo", String(f.yearTo));
  if (f.maxRuntime) p.set("maxRuntime", String(f.maxRuntime));
  if (f.watched) p.set("watched", f.watched);
  if (f.libraryId) p.set("libraryId", f.libraryId);
  if (f.preset) p.set("preset", f.preset);
  if (f.mix) p.set("mix", f.mix);
  return p.toString();
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchPool(qs: string, signal?: AbortSignal): Promise<PoolResponse> {
  return fetch(`/api/movies/recommend/pool?${qs}`, { signal }).then((r) => json<PoolResponse>(r));
}

export function postDraw(req: DrawRequest): Promise<DrawResponse> {
  return fetch("/api/movies/recommend/draw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  }).then((r) => json<DrawResponse>(r));
}

export function postHistory(req: HistoryRequest): Promise<void> {
  return fetch("/api/movies/recommend/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });
}

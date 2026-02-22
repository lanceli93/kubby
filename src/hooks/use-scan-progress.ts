import { useQuery } from "@tanstack/react-query";

interface ScanProgress {
  libraryId: string;
  current: number;
  total: number;
  status: "scanning" | "done" | "error";
  scannedCount?: number;
  error?: string;
}

async function fetchScanStatus(): Promise<ScanProgress[]> {
  const res = await fetch("/api/scan-status");
  return res.json();
}

/**
 * Poll server for active scan progress.
 * Polls every 2s when any scan is active, stops when idle.
 */
export function useScanProgress() {
  return useQuery<ScanProgress[]>({
    queryKey: ["scan-status"],
    queryFn: fetchScanStatus,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll fast while any scan is running, slow otherwise
      if (data?.some((s) => s.status === "scanning")) return 2000;
      if (data?.some((s) => s.status === "done" || s.status === "error")) return 3000;
      return 10000; // slow background poll to detect scans started from other clients
    },
  });
}

/**
 * Get scan progress for a specific library.
 */
export function useLibraryScanProgress(libraryId: string) {
  const { data } = useScanProgress();
  return data?.find((s) => s.libraryId === libraryId) ?? null;
}

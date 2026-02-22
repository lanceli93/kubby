// Server-side in-memory scan state — survives client navigation
// but resets on server restart (which is fine, scan would be dead anyway)

export interface ScanProgress {
  libraryId: string;
  current: number;
  total: number;
  status: "scanning" | "done" | "error";
  scannedCount?: number;
  error?: string;
  updatedAt: number; // Date.now()
}

const activeScans = new Map<string, ScanProgress>();

export function setScanProgress(libraryId: string, data: Partial<ScanProgress>) {
  const existing = activeScans.get(libraryId);
  activeScans.set(libraryId, {
    libraryId,
    current: 0,
    total: 0,
    status: "scanning",
    ...existing,
    ...data,
    updatedAt: Date.now(),
  });
}

export function clearScan(libraryId: string) {
  activeScans.delete(libraryId);
}

export function getActiveScans(): ScanProgress[] {
  // Auto-clean stale entries (> 5 minutes since last update)
  const staleThreshold = Date.now() - 5 * 60 * 1000;
  for (const [id, scan] of activeScans) {
    if (scan.updatedAt < staleThreshold) {
      activeScans.delete(id);
    }
  }
  return Array.from(activeScans.values());
}

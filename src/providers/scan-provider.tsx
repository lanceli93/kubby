"use client";

import { createContext, useContext, useCallback, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface ScanState {
  scanning: boolean;
  progress: { current: number; total: number } | null;
  result: string | null; // "done:42" or "error"
}

type ScanMap = Map<string, ScanState>;

// ─── External store (survives re-renders, shared across all consumers) ───
let scans: ScanMap = new Map();
const listeners = new Set<() => void>();

function getSnapshot(): ScanMap {
  return scans;
}

function emitChange() {
  // Create new Map reference so React detects the change
  scans = new Map(scans);
  listeners.forEach((l) => l());
}

function setScanState(libraryId: string, update: Partial<ScanState>) {
  const prev = scans.get(libraryId) ?? { scanning: false, progress: null, result: null };
  scans.set(libraryId, { ...prev, ...update });
  emitChange();
}

function removeScan(libraryId: string) {
  scans.delete(libraryId);
  emitChange();
}

// ─── Context (provides startScan + queryClient integration) ───
interface ScanContextValue {
  startScan: (libraryId: string) => void;
}

const ScanContext = createContext<ScanContextValue>({ startScan: () => {} });

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const activeStreams = useRef(new Set<string>());

  const startScan = useCallback(
    (libraryId: string) => {
      // Prevent duplicate scans for the same library
      if (activeStreams.current.has(libraryId)) return;
      activeStreams.current.add(libraryId);

      setScanState(libraryId, { scanning: true, progress: null, result: null });

      (async () => {
        try {
          const res = await fetch(`/api/libraries/${libraryId}/scan`, { method: "POST" });
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No stream");

          const decoder = new TextDecoder();
          let buffer = "";
          let scannedCount = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const match = line.match(/^data: (.+)$/m);
              if (!match) continue;
              const data = JSON.parse(match[1]);
              if (data.done) {
                scannedCount = data.scannedCount ?? 0;
              } else if (data.error) {
                throw new Error(data.error);
              } else if (data.total) {
                setScanState(libraryId, {
                  progress: { current: data.current, total: data.total },
                });
              }
            }
          }

          setScanState(libraryId, { scanning: false, progress: null, result: `done:${scannedCount}` });
          queryClient.invalidateQueries({ queryKey: ["libraries"] });
          queryClient.invalidateQueries({ queryKey: ["movies"] });
          setTimeout(() => removeScan(libraryId), 5000);
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            setScanState(libraryId, { scanning: false, progress: null, result: "error" });
            setTimeout(() => removeScan(libraryId), 5000);
          }
        } finally {
          activeStreams.current.delete(libraryId);
        }
      })();
    },
    [queryClient]
  );

  return (
    <ScanContext.Provider value={{ startScan }}>
      {children}
    </ScanContext.Provider>
  );
}

/** Access the startScan function */
export function useScanActions() {
  return useContext(ScanContext);
}

/** Subscribe to all active scans */
export function useAllScans(): ScanMap {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getSnapshot,
    getSnapshot,
  );
}

/** Get scan state for a specific library */
export function useLibraryScan(libraryId: string) {
  const scansMap = useAllScans();
  const { startScan } = useScanActions();
  const state = scansMap.get(libraryId);
  return {
    scanning: state?.scanning ?? false,
    progress: state?.progress ?? null,
    result: state?.result ?? null,
    startScan: () => startScan(libraryId),
  };
}

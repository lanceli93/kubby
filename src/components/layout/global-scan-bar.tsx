"use client";

import { useAllScans } from "@/providers/scan-provider";
import { useTranslations } from "next-intl";

export function GlobalScanBar() {
  const scans = useAllScans();
  const tHome = useTranslations("home");

  if (scans.size === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-0 pointer-events-none">
      {Array.from(scans.entries()).map(([libraryId, state]) => {
        const { scanning, progress, result } = state;
        const isDone = result?.startsWith("done:");
        const isError = result === "error";
        const scannedCount = isDone ? parseInt(result!.split(":")[1], 10) : 0;
        const percent = progress ? (progress.current / progress.total) * 100 : 0;

        return (
          <div key={libraryId} className="pointer-events-auto">
            {/* Progress track */}
            {scanning && (
              <div className="h-0.5 w-full bg-primary/20">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: progress ? `${percent}%` : "0%" }}
                />
              </div>
            )}
            {/* Text */}
            <div className="flex items-center justify-center bg-black/80 backdrop-blur-md px-4 py-2 text-xs">
              {scanning && progress && (
                <span className="text-white/80">
                  {tHome("scanProgress", { current: progress.current, total: progress.total })}
                </span>
              )}
              {scanning && !progress && (
                <span className="text-white/80">{tHome("scanning")}</span>
              )}
              {isDone && (
                <span className="text-primary">{tHome("scanComplete", { count: scannedCount })}</span>
              )}
              {isError && (
                <span className="text-destructive">{tHome("scanFailed")}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAllScans } from "@/providers/scan-provider";
import { useTranslations } from "next-intl";

export function GlobalScanBar() {
  const scans = useAllScans();
  const tHome = useTranslations("home");
  const [expandedSkips, setExpandedSkips] = useState<Set<string>>(new Set());

  if (scans.size === 0) return null;

  const toggleExpand = (libraryId: string) => {
    setExpandedSkips((prev) => {
      const next = new Set(prev);
      if (next.has(libraryId)) next.delete(libraryId);
      else next.add(libraryId);
      return next;
    });
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-0 pointer-events-none">
      {Array.from(scans.entries()).map(([libraryId, state]) => {
        const { scanning, progress, result, skipped } = state;
        const isDone = result?.startsWith("done:");
        const isError = result === "error";
        const parts = isDone ? result!.split(":") : [];
        const scannedCount = isDone ? parseInt(parts[1], 10) : 0;
        const skippedCount = isDone ? parseInt(parts[2] || "0", 10) : 0;
        const percent = progress ? (progress.current / progress.total) * 100 : 0;
        const isExpanded = expandedSkips.has(libraryId);

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
                  {progress.title
                    ? tHome("scanProgressWithTitle", { title: progress.title, current: progress.current, total: progress.total })
                    : tHome("scanProgress", { current: progress.current, total: progress.total })}
                </span>
              )}
              {scanning && !progress && (
                <span className="text-white/80">{tHome("scanning")}</span>
              )}
              {isDone && (
                <span className="text-primary">
                  {skippedCount > 0
                    ? tHome("scanCompleteWithSkipped", { count: scannedCount, skipped: skippedCount })
                    : tHome("scanComplete", { count: scannedCount })}
                  {skippedCount > 0 && skipped.length > 0 && (
                    <button
                      onClick={() => toggleExpand(libraryId)}
                      className="ml-2 inline-flex items-center gap-0.5 text-white/60 hover:text-white/90 transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                    </button>
                  )}
                </span>
              )}
              {isError && (
                <span className="text-destructive">{tHome("scanFailed")}</span>
              )}
            </div>
            {/* Expanded skip list */}
            {isDone && isExpanded && skipped.length > 0 && (
              <div className="bg-black/80 backdrop-blur-md px-4 pb-3 pt-1 text-xs max-h-48 overflow-y-auto">
                <p className="text-white/60 mb-1.5 font-medium">{tHome("skippedFolders")}</p>
                <div className="flex flex-col gap-1">
                  {skipped.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-white/50">
                      <span className="truncate">{item.name}</span>
                      <span className="shrink-0 text-white/30">—</span>
                      <span className="shrink-0 text-white/40">
                        {item.reason === 'no_nfo' && tHome("skipReasonNoNfo")}
                        {item.reason === 'no_video' && tHome("skipReasonNoVideo")}
                        {item.reason === 'nfo_parse_error' && tHome("skipReasonNfoParseFailed")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

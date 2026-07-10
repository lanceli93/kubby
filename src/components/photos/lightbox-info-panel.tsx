"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { X, Download } from "lucide-react";

// Detail (EXIF) shape from GET /api/photos/[id]. Only the fields the panel
// renders are typed; `exif` and other columns are ignored here.
interface PhotoDetail {
  id: string;
  fileName: string;
  isVideo: boolean;
  takenAt: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fileSize: number | null;
  cameraMake: string | null;
  cameraModel: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
}

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LightboxInfoPanel({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const t = useTranslations("photos");
  const locale = useLocale();

  const { data, isLoading } = useQuery<PhotoDetail>({
    queryKey: ["photo", id],
    queryFn: () => fetch(`/api/photos/${id}`).then((r) => r.json()),
  });

  const intlLocale = locale === "zh" ? "zh-CN" : locale;
  const dateTime =
    data?.takenAt != null
      ? new Intl.DateTimeFormat(intlLocale, {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(data.takenAt))
      : null;

  const camera = data
    ? [data.cameraMake, data.cameraModel].filter(Boolean).join(" ")
    : "";
  const hasGps = data?.gpsLat != null && data?.gpsLng != null;

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full flex-col bg-neutral-900/95 text-white backdrop-blur-sm sm:w-80">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold">{t("infoTitle")}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        {isLoading || !data ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-20 rounded bg-white/10" />
                <div className="h-4 w-40 rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <InfoRow label={t("infoFileName")} value={data.fileName} />
            {dateTime && (
              <InfoRow label={t("infoTakenAt")} value={dateTime} />
            )}
            {data.width && data.height && (
              <InfoRow
                label={t("infoDimensions")}
                value={`${data.width} × ${data.height}`}
              />
            )}
            {data.fileSize != null && (
              <InfoRow
                label={t("infoFileSize")}
                value={formatFileSize(data.fileSize)}
              />
            )}
            {camera && <InfoRow label={t("infoCamera")} value={camera} />}
            {data.isVideo && data.durationSeconds != null && (
              <InfoRow
                label={t("infoDuration")}
                value={formatDuration(data.durationSeconds)}
              />
            )}
            {hasGps && (
              <InfoRow
                label={t("infoGps")}
                value={`${data.gpsLat!.toFixed(6)}, ${data.gpsLng!.toFixed(6)}`}
              />
            )}
          </>
        )}
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        <a
          href={`/api/photos/${id}/file?original=1`}
          download
          className="flex items-center justify-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          <Download className="h-4 w-4" />
          {t("downloadOriginal")}
        </a>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium uppercase tracking-wide text-white/40">
        {label}
      </div>
      <div className="break-words text-white/90">{value}</div>
    </div>
  );
}

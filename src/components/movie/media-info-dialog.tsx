"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface MediaInfoDialogProps {
  movieId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MediaStream {
  streamIndex: number;
  streamType: "video" | "audio" | "subtitle";
  codec: string | null;
  profile: string | null;
  bitrate: number | null;
  language: string | null;
  title: string | null;
  isDefault: boolean;
  isForced: boolean;
  width: number | null;
  height: number | null;
  bitDepth: number | null;
  frameRate: string | null;
  hdrType: string | null;
  pixFmt: string | null;
  level: number | null;
  channels: number | null;
  channelLayout: string | null;
  sampleRate: number | null;
}

interface MediaInfoData {
  fileName: string;
  filePath: string;
  container: string | null;
  fileSize: number | null;
  totalBitrate: number | null;
  formatName: string | null;
  durationSeconds: number | null;
  streams: MediaStream[];
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function formatBitrate(bps: number | null): string {
  if (bps == null || bps <= 0) return "—";
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${bps} bps`;
}

function formatSampleRate(hz: number | null): string {
  if (hz == null || hz <= 0) return "—";
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)} kHz`;
  return `${hz} Hz`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatChannels(channels: number | null, layout: string | null): string {
  if (layout) return layout;
  if (channels == null) return "—";
  if (channels === 8) return "7.1";
  if (channels === 6) return "5.1";
  if (channels === 2) return "Stereo";
  if (channels === 1) return "Mono";
  return `${channels}ch`;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value || value === "—") return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-sm text-white/50 shrink-0">{label}</span>
      <span className="text-sm text-white/90 text-right break-all">{value}</span>
    </div>
  );
}

function VideoStreamInfo({ stream, index, total, t }: { stream: MediaStream; index: number; total: number; t: (key: string) => string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <h4 className="text-sm font-medium text-white/70 mb-2">
        {t("stream")} #{index + 1}
        {total > 1 && stream.isDefault && <span className="ml-2 text-xs text-primary">({t("default")})</span>}
      </h4>
      <div className="flex flex-col">
        <InfoRow label={t("codec")} value={stream.codec} />
        <InfoRow label={t("profile")} value={stream.profile} />
        <InfoRow label={t("resolution")} value={stream.width && stream.height ? `${stream.width} × ${stream.height}` : null} />
        <InfoRow label={t("frameRate")} value={stream.frameRate ? `${parseFloat(stream.frameRate).toFixed(3)} fps` : null} />
        <InfoRow label={t("bitrate")} value={formatBitrate(stream.bitrate)} />
        <InfoRow label={t("bitDepth")} value={stream.bitDepth ? `${stream.bitDepth}-bit` : null} />
        <InfoRow label={t("pixelFormat")} value={stream.pixFmt} />
        <InfoRow label={t("level")} value={stream.level != null ? String(stream.level) : null} />
        <InfoRow label={t("hdr")} value={stream.hdrType} />
        <InfoRow label={t("language")} value={stream.language} />
        <InfoRow label={t("title2")} value={stream.title} />
      </div>
    </div>
  );
}

function AudioStreamInfo({ stream, index, total, t }: { stream: MediaStream; index: number; total: number; t: (key: string) => string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <h4 className="text-sm font-medium text-white/70 mb-2">
        {t("stream")} #{index + 1}
        {total > 1 && stream.isDefault && <span className="ml-2 text-xs text-primary">({t("default")})</span>}
        {total > 1 && stream.isForced && <span className="ml-2 text-xs text-yellow-400">({t("forced")})</span>}
      </h4>
      <div className="flex flex-col">
        <InfoRow label={t("codec")} value={stream.codec} />
        <InfoRow label={t("profile")} value={stream.profile} />
        <InfoRow label={t("bitrate")} value={formatBitrate(stream.bitrate)} />
        <InfoRow label={t("channels")} value={stream.channels != null ? String(stream.channels) : null} />
        <InfoRow label={t("channelLayout")} value={formatChannels(stream.channels, stream.channelLayout)} />
        <InfoRow label={t("sampleRate")} value={formatSampleRate(stream.sampleRate)} />
        <InfoRow label={t("language")} value={stream.language} />
        <InfoRow label={t("title2")} value={stream.title} />
      </div>
    </div>
  );
}

function SubtitleStreamInfo({ stream, index, total, t }: { stream: MediaStream; index: number; total: number; t: (key: string) => string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
      <h4 className="text-sm font-medium text-white/70 mb-2">
        {t("stream")} #{index + 1}
        {total > 1 && stream.isDefault && <span className="ml-2 text-xs text-primary">({t("default")})</span>}
        {total > 1 && stream.isForced && <span className="ml-2 text-xs text-yellow-400">({t("forced")})</span>}
      </h4>
      <div className="flex flex-col">
        <InfoRow label={t("codec")} value={stream.codec} />
        <InfoRow label={t("language")} value={stream.language} />
        <InfoRow label={t("title2")} value={stream.title} />
      </div>
    </div>
  );
}

export function MediaInfoDialog({ movieId, open, onOpenChange }: MediaInfoDialogProps) {
  const t = useTranslations("mediaInfoDialog");

  const { data, isLoading } = useQuery<MediaInfoData>({
    queryKey: ["media-info", movieId],
    queryFn: async () => {
      const r = await fetch(`/api/movies/${movieId}/media-info`);
      if (!r.ok) throw new Error("Failed to fetch media info");
      return r.json();
    },
    enabled: open,
  });

  const videoStreams = data?.streams?.filter((s) => s.streamType === "video") ?? [];
  const audioStreams = data?.streams?.filter((s) => s.streamType === "audio") ?? [];
  const subtitleStreams = data?.streams?.filter((s) => s.streamType === "subtitle") ?? [];

  const hasStreams = (data?.streams?.length ?? 0) > 0;

  // Determine default tab
  const defaultTab = videoStreams.length > 0 ? "video" : audioStreams.length > 0 ? "audio" : "subtitles";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading...
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Error loading media info
          </div>
        ) : (
          <div className="flex flex-col gap-4 overflow-y-auto pr-1">
            {/* File info header */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex flex-col">
                <InfoRow label={t("file")} value={data.fileName} />
                <InfoRow label={t("container")} value={data.container?.toUpperCase()} />
                <InfoRow label={t("format")} value={data.formatName} />
                <InfoRow label={t("fileSize")} value={formatFileSize(data.fileSize)} />
                <InfoRow label={t("totalBitrate")} value={formatBitrate(data.totalBitrate)} />
                <InfoRow label={t("duration")} value={formatDuration(data.durationSeconds)} />
              </div>
            </div>

            {/* Stream tabs */}
            {hasStreams ? (
              <Tabs defaultValue={defaultTab}>
                <TabsList className="w-full">
                  {videoStreams.length > 0 && (
                    <TabsTrigger value="video">
                      {t("videoTab")}{videoStreams.length > 1 ? ` (${videoStreams.length})` : ""}
                    </TabsTrigger>
                  )}
                  {audioStreams.length > 0 && (
                    <TabsTrigger value="audio">
                      {t("audioTab")}{audioStreams.length > 1 ? ` (${audioStreams.length})` : ""}
                    </TabsTrigger>
                  )}
                  {subtitleStreams.length > 0 && (
                    <TabsTrigger value="subtitles">
                      {t("subtitlesTab")}{subtitleStreams.length > 1 ? ` (${subtitleStreams.length})` : ""}
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="video" className="flex flex-col gap-3 mt-2">
                  {videoStreams.map((stream, i) => (
                    <VideoStreamInfo key={stream.streamIndex} stream={stream} index={i} total={videoStreams.length} t={t} />
                  ))}
                </TabsContent>

                <TabsContent value="audio" className="flex flex-col gap-3 mt-2">
                  {audioStreams.map((stream, i) => (
                    <AudioStreamInfo key={stream.streamIndex} stream={stream} index={i} total={audioStreams.length} t={t} />
                  ))}
                </TabsContent>

                <TabsContent value="subtitles" className="flex flex-col gap-3 mt-2">
                  {subtitleStreams.map((stream, i) => (
                    <SubtitleStreamInfo key={stream.streamIndex} stream={stream} index={i} total={subtitleStreams.length} t={t} />
                  ))}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-muted-foreground">{t("noStreams")}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{t("rescanHint")}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

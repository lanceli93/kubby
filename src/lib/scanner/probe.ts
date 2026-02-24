import { execFile } from "child_process";
import path from "path";

export interface ProbeStream {
  streamIndex: number;
  streamType: "video" | "audio" | "subtitle";
  codec: string | null;
  profile: string | null;
  bitrate: number | null;
  language: string | null;
  title: string | null;
  isDefault: boolean;
  isForced: boolean;
  // Video-specific
  width: number | null;
  height: number | null;
  bitDepth: number | null;
  frameRate: string | null;
  hdrType: string | null;
  // Audio-specific
  channels: number | null;
  channelLayout: string | null;
  sampleRate: number | null;
}

export interface ProbeResult {
  // Legacy flat fields for backward compat
  videoCodec: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  audioCodec: string | null;
  audioChannels: number | null;
  durationSeconds: number | null;
  container: string;
  // New detailed fields
  streams: ProbeStream[];
  totalBitrate: number | null;
  fileSize: number | null;
  formatName: string | null;
}

function parseFrameRate(rFrameRate: string | undefined): string | null {
  if (!rFrameRate) return null;
  const parts = rFrameRate.split("/");
  if (parts.length === 2) {
    const num = parseInt(parts[0], 10);
    const den = parseInt(parts[1], 10);
    if (den > 0 && !isNaN(num)) {
      return (num / den).toFixed(3);
    }
  }
  return rFrameRate;
}

function detectHdrType(stream: Record<string, unknown>): string | null {
  const colorTransfer = stream.color_transfer as string | undefined;
  const sideDataList = stream.side_data_list as Array<Record<string, unknown>> | undefined;

  let hasDovi = false;
  let hasMasteringDisplay = false;

  if (sideDataList && Array.isArray(sideDataList)) {
    for (const sd of sideDataList) {
      const sdType = sd.side_data_type as string | undefined;
      if (sdType?.includes("DOVI configuration record")) {
        hasDovi = true;
      }
      if (sdType?.includes("Mastering display") || sdType?.includes("Content light level")) {
        hasMasteringDisplay = true;
      }
    }
  }

  if (hasDovi) return "Dolby Vision";
  if (colorTransfer === "smpte2084" && hasMasteringDisplay) return "HDR10";
  if (colorTransfer === "smpte2084") return "HDR10";
  if (colorTransfer === "arib-std-b67") return "HLG";
  return null;
}

function parseStream(raw: Record<string, unknown>): ProbeStream | null {
  const codecType = raw.codec_type as string;
  if (codecType !== "video" && codecType !== "audio" && codecType !== "subtitle") {
    return null;
  }

  // Skip image-based video streams (album art, thumbnails)
  if (codecType === "video") {
    const disposition = raw.disposition as Record<string, number> | undefined;
    if (disposition?.attached_pic === 1) return null;
  }

  const tags = (raw.tags || {}) as Record<string, string>;
  const disposition = (raw.disposition || {}) as Record<string, number>;

  const stream: ProbeStream = {
    streamIndex: typeof raw.index === "number" ? raw.index : 0,
    streamType: codecType as "video" | "audio" | "subtitle",
    codec: raw.codec_name ? String(raw.codec_name) : null,
    profile: raw.profile && raw.profile !== "unknown" ? String(raw.profile) : null,
    bitrate: raw.bit_rate ? parseInt(String(raw.bit_rate), 10) : null,
    language: tags.language || null,
    title: tags.title || null,
    isDefault: disposition.default === 1,
    isForced: disposition.forced === 1,
    // Video
    width: raw.width ? Number(raw.width) : null,
    height: raw.height ? Number(raw.height) : null,
    bitDepth: raw.bits_per_raw_sample ? parseInt(String(raw.bits_per_raw_sample), 10) : null,
    frameRate: parseFrameRate(raw.r_frame_rate as string | undefined),
    hdrType: codecType === "video" ? detectHdrType(raw) : null,
    // Audio
    channels: raw.channels ? Number(raw.channels) : null,
    channelLayout: raw.channel_layout ? String(raw.channel_layout) : null,
    sampleRate: raw.sample_rate ? parseInt(String(raw.sample_rate), 10) : null,
  };

  return stream;
}

export function probeVideo(filePath: string): Promise<ProbeResult | null> {
  const ffprobePath = process.env.FFPROBE_PATH || "ffprobe";
  return new Promise((resolve) => {
    try {
      execFile(
        ffprobePath,
        [
          "-v", "quiet",
          "-print_format", "json",
          "-show_streams",
          "-show_format",
          filePath,
        ],
        { timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            console.warn(`ffprobe failed for ${filePath}:`, error.message);
            resolve(null);
            return;
          }

          try {
            const data = JSON.parse(stdout);
            const rawStreams: Array<Record<string, unknown>> = data.streams || [];
            const format = data.format || {};

            const streams: ProbeStream[] = [];
            for (const raw of rawStreams) {
              const parsed = parseStream(raw);
              if (parsed) streams.push(parsed);
            }

            const videoStream = streams.find((s) => s.streamType === "video");
            const audioStream = streams.find((s) => s.streamType === "audio");

            const ext = path.extname(filePath).toLowerCase().replace(".", "");
            const duration = format.duration ? parseFloat(format.duration) : null;

            resolve({
              videoCodec: videoStream?.codec || null,
              videoWidth: videoStream?.width || null,
              videoHeight: videoStream?.height || null,
              audioCodec: audioStream?.codec || null,
              audioChannels: audioStream?.channels || null,
              durationSeconds: duration && !isNaN(duration) ? Math.round(duration) : null,
              container: ext,
              streams,
              totalBitrate: format.bit_rate ? parseInt(String(format.bit_rate), 10) : null,
              fileSize: format.size ? parseInt(String(format.size), 10) : null,
              formatName: format.format_long_name || format.format_name || null,
            });
          } catch {
            console.warn(`Failed to parse ffprobe output for ${filePath}`);
            resolve(null);
          }
        }
      );
    } catch (err) {
      console.warn(`ffprobe spawn failed:`, (err as Error).message);
      resolve(null);
    }
  });
}

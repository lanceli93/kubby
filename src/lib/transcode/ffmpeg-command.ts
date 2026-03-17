import type { PlaybackDecision } from "./playback-decider";
import type { EncoderConfig } from "./hw-accel";
import { isNvdecSupported, getResolutionBitrate } from "./hw-accel";

interface BuildArgs {
  inputPath: string;
  outputDir: string;
  decision: PlaybackDecision;
  seekToSeconds?: number;
  encoderConfig?: EncoderConfig;
  maxWidth?: number;
  sourceVideoCodec?: string | null;
  sourceVideoWidth?: number | null;
}

export function buildFfmpegArgs({ inputPath, outputDir, decision, seekToSeconds, encoderConfig, maxWidth, sourceVideoCodec, sourceVideoWidth, forceHevcFmp4 }: BuildArgs & { forceHevcFmp4?: boolean }): string[] {
  const args: string[] = [];
  const needsTranscode = decision.videoAction !== "copy";

  // Only use CUDA hardware decode for codecs NVDEC actually supports
  // (mpeg4/divx/wmv etc. will use CPU decode + NVENC encode)
  const useCudaDecode = needsTranscode
    && encoderConfig?.hwaccel === "cuda"
    && isNvdecSupported(sourceVideoCodec);

  // Fix timestamps and discard corrupt frames (helps AVI/MPEG4 containers
  // that lack proper timestamps or produce garbage after imprecise seeking)
  args.push("-fflags", "+genpts+discardcorrupt");

  // Increase analysis limits for containers with poor headers (AVI, WMV, etc.)
  args.push("-analyzeduration", "10M", "-probesize", "10M");

  // Fast input seeking (before -i)
  if (seekToSeconds && seekToSeconds > 0) {
    args.push("-ss", String(seekToSeconds));
  }

  // Hardware acceleration input flags (before -i)
  if (useCudaDecode) {
    // Full GPU pipeline: NVDEC decode → GPU memory → scale_cuda → NVENC encode
    args.push("-hwaccel", "cuda", "-hwaccel_output_format", "cuda");
  }

  args.push("-i", inputPath);

  // Normalize output timestamps from 0 after seeking
  if (seekToSeconds && seekToSeconds > 0) {
    args.push("-start_at_zero");
  }

  // Video codec
  if (decision.videoAction === "copy") {
    args.push("-c:v", "copy");
  } else {
    const enc = encoderConfig;
    if (!enc || enc.name === "libx264") {
      args.push("-threads", "0");
    }

    // Build video filter chain
    const vfParts: string[] = [];

    // Scale filter — use scale_cuda when frames are in GPU memory
    if (maxWidth && maxWidth > 0) {
      if (useCudaDecode) {
        vfParts.push(`scale_cuda='min(${maxWidth},iw)':-2`);
      } else {
        vfParts.push(`scale='min(${maxWidth},iw)':-2`);
      }
    }

    if (vfParts.length > 0) {
      args.push("-vf", vfParts.join(","));
    }

    // Encoder + quality args
    args.push("-c:v", enc?.name ?? "libx264", ...(enc?.qualityArgs ?? ["-preset", "ultrafast", "-crf", "23"]));

    // Force an IDR keyframe at the very start so HLS playback begins immediately
    // without black/corrupt frames (critical after seeking in AVI/MPEG4)
    args.push("-force_key_frames", "expr:eq(t,0)");

    // Dynamic bitrate based on effective output resolution
    const effectiveWidth = (maxWidth && maxWidth > 0) ? maxWidth : (sourceVideoWidth ?? 1920);
    const { maxrate, bufsize } = getResolutionBitrate(effectiveWidth);
    args.push("-maxrate", maxrate, "-bufsize", bufsize);
  }

  // Audio codec
  if (decision.audioAction === "none") {
    args.push("-an");
  } else if (decision.audioAction === "copy") {
    args.push("-c:a", "copy");
  } else {
    args.push("-c:a", "aac", "-b:a", "192k");
  }

  // HLS output — short first segment for faster playback start
  // Apple HLS spec requires HEVC in fMP4 segments (not MPEG-TS)
  if (forceHevcFmp4) {
    args.push(
      "-f", "hls",
      "-hls_time", "6",
      "-hls_init_time", "1",
      "-hls_list_size", "0",
      "-hls_playlist_type", "event",
      "-hls_segment_type", "fmp4",
      "-hls_segment_filename", `${outputDir}/segment_%04d.m4s`,
      `${outputDir}/playlist.m3u8`,
    );
  } else {
    args.push(
      "-f", "hls",
      "-hls_time", "6",
      "-hls_init_time", "1",
      "-hls_list_size", "0",
      "-hls_playlist_type", "event",
      "-hls_segment_filename", `${outputDir}/segment_%04d.ts`,
      `${outputDir}/playlist.m3u8`,
    );
  }

  return args;
}

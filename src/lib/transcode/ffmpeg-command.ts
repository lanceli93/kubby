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

export function buildFfmpegArgs({ inputPath, outputDir, decision, seekToSeconds, encoderConfig, maxWidth, sourceVideoCodec, sourceVideoWidth }: BuildArgs): string[] {
  const args: string[] = [];
  const needsTranscode = decision.videoAction !== "copy";

  // Only use CUDA hardware decode for codecs NVDEC actually supports
  // (mpeg4/divx/wmv etc. will use CPU decode + NVENC encode)
  const useCudaDecode = needsTranscode
    && encoderConfig?.hwaccel === "cuda"
    && isNvdecSupported(sourceVideoCodec);

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

  // Video codec
  if (decision.videoAction === "copy") {
    args.push("-c:v", "copy");
  } else {
    const enc = encoderConfig;
    if (!enc || enc.name === "libx264") {
      args.push("-threads", "0");
    }

    // Scale filter — use scale_cuda when frames are in GPU memory
    if (maxWidth && maxWidth > 0) {
      if (useCudaDecode) {
        args.push("-vf", `scale_cuda='min(${maxWidth},iw)':-2`);
      } else {
        args.push("-vf", `scale='min(${maxWidth},iw)':-2`);
      }
    }

    // Encoder + quality args
    args.push("-c:v", enc?.name ?? "libx264", ...(enc?.qualityArgs ?? ["-preset", "ultrafast", "-crf", "23"]));

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

  // HLS output
  args.push(
    "-f", "hls",
    "-hls_time", "6",
    "-hls_list_size", "0",
    "-hls_playlist_type", "event",
    "-hls_segment_filename", `${outputDir}/segment_%04d.ts`,
    `${outputDir}/playlist.m3u8`,
  );

  return args;
}
